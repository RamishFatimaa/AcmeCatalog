using System.Diagnostics;
using System.Net;
using System.Net.Http.Json;

namespace IntegrationTests;

// The "missing middle" this suite didn't have: AuthApiTests.cs and
// ItemsApiTests.cs each exercise one real service in isolation;
// IdentityClientResilienceTests.cs exercises catalog-service's resilience
// pipeline against a WireMock.Net stand-in for identity-service; the
// Cypress e2e suite exercises both real services together, but only ever
// reachable through the full UI stack, so a failure there could be
// frontend, either backend, or the network between them.
//
// This boots both services as real OS processes — real ports, real HTTP,
// no WireMock, no browser — and calls the actual inter-service boundary
// directly: log in for real against identity-service, create an item for
// real against catalog-service, then prove catalog-service's own live
// call to identity-service's /internal/users resolves the real seeded
// username. This is the one test that would catch the contract between
// these two services silently breaking, independent of the frontend ever
// touching it.
[TestFixture]
public class CatalogIdentityIntegrationTests
{
    private const string IdentityUrl = "http://localhost:5501";
    private const string CatalogUrl = "http://localhost:5502";

    private Process? _identityProcess;
    private Process? _catalogProcess;
    private HttpClient _identityClient = null!;
    private HttpClient _catalogClient = null!;
    private string _identityDbPath = null!;
    private string _catalogDbPath = null!;

    [OneTimeSetUp]
    public async Task OneTimeSetUp()
    {
        var repoRoot = FindRepoRoot();
        _identityDbPath = Path.Combine(Path.GetTempPath(), $"integration-identity-{Guid.NewGuid()}.db");
        _catalogDbPath = Path.Combine(Path.GetTempPath(), $"integration-catalog-{Guid.NewGuid()}.db");

        _identityProcess = StartService(
            repoRoot,
            "services/identity-service",
            IdentityUrl,
            [("ConnectionStrings__DefaultConnection", $"Data Source={_identityDbPath}")]);
        await WaitForHealth(IdentityUrl);

        _catalogProcess = StartService(
            repoRoot,
            "services/catalog-service",
            CatalogUrl,
            [
                ("ConnectionStrings__DefaultConnection", $"Data Source={_catalogDbPath}"),
                ("Services__IdentityServiceBaseUrl", IdentityUrl),
            ]);
        await WaitForHealth(CatalogUrl);

        _identityClient = new HttpClient { BaseAddress = new Uri(IdentityUrl) };
        _catalogClient = new HttpClient { BaseAddress = new Uri(CatalogUrl) };
    }

    [OneTimeTearDown]
    public void OneTimeTearDown()
    {
        _identityClient?.Dispose();
        _catalogClient?.Dispose();
        KillProcessTree(_identityProcess);
        KillProcessTree(_catalogProcess);
        _identityProcess?.Dispose();
        _catalogProcess?.Dispose();
        TryDelete(_identityDbPath);
        TryDelete(_catalogDbPath);
    }

    [Test]
    public async Task CreatedItem_DisplayNameResolves_ViaRealLiveCallBetweenBothServices()
    {
        var loginResponse = await _identityClient.PostAsJsonAsync("/api/auth/login", new { username = "testuser", password = "Test123!" });
        Assert.That(loginResponse.StatusCode, Is.EqualTo(HttpStatusCode.OK), "real identity-service login must succeed before this test means anything");
        var login = await loginResponse.Content.ReadFromJsonAsync<LoginResponseDto>();

        _catalogClient.DefaultRequestHeaders.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", login!.Token);

        var createResponse = await _catalogClient.PostAsJsonAsync("/api/items", new
        {
            name = "Real Two-Service Integration Item",
            price = 9.99,
            description = "Created via a real login against a real identity-service.",
            category = "Electronics",
        });
        Assert.That(createResponse.StatusCode, Is.EqualTo(HttpStatusCode.Created));
        var created = await createResponse.Content.ReadFromJsonAsync<ItemDto>();

        // This GET is what makes the test real: catalog-service's own
        // ItemEnricher fires a live HTTP call to the real identity-service
        // process above to resolve created.CreatedByUserId — no WireMock,
        // no mock, nothing simulated on either side.
        var getResponse = await _catalogClient.GetAsync($"/api/items/{created!.Id}");
        Assert.That(getResponse.StatusCode, Is.EqualTo(HttpStatusCode.OK));
        var fetched = await getResponse.Content.ReadFromJsonAsync<ItemDto>();

        Assert.That(fetched!.CreatedByDisplayName, Is.EqualTo("testuser"),
            "the real inter-service call should have resolved the real seeded username, not fallen back to Unknown");
    }

    private static Process StartService(string repoRoot, string relativeProjectPath, string url, (string Key, string Value)[] extraEnv)
    {
        var psi = new ProcessStartInfo("dotnet", $"run --project {relativeProjectPath} --urls {url}")
        {
            WorkingDirectory = repoRoot,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
        };
        psi.Environment["ASPNETCORE_ENVIRONMENT"] = "Development";
        foreach (var (key, value) in extraEnv)
        {
            psi.Environment[key] = value;
        }

        var process = Process.Start(psi) ?? throw new InvalidOperationException($"Failed to start process for {relativeProjectPath}");
        // Drain output asynchronously so the process's stdout buffer never
        // fills and blocks it — we don't need the output unless it fails
        // to become healthy, at which point WaitForHealth's own message
        // points at checking these processes manually.
        process.OutputDataReceived += (_, _) => { };
        process.ErrorDataReceived += (_, _) => { };
        process.BeginOutputReadLine();
        process.BeginErrorReadLine();
        return process;
    }

    private static async Task WaitForHealth(string url)
    {
        using var client = new HttpClient { Timeout = TimeSpan.FromSeconds(5) };
        for (var i = 0; i < 60; i++)
        {
            try
            {
                var response = await client.GetAsync($"{url}/health");
                if (response.IsSuccessStatusCode) return;
            }
            catch
            {
                // not up yet, keep polling
            }
            await Task.Delay(1000);
        }
        throw new TimeoutException($"{url}/health never became healthy within 60s");
    }

    private static void KillProcessTree(Process? process)
    {
        if (process is null) return;
        try
        {
            if (!process.HasExited)
            {
                process.Kill(entireProcessTree: true);
                process.WaitForExit(5000);
            }
        }
        catch
        {
            // best-effort cleanup — disposal itself happens in OneTimeTearDown
        }
    }

    private static void TryDelete(string path)
    {
        try
        {
            if (File.Exists(path)) File.Delete(path);
        }
        catch
        {
            // best-effort cleanup
        }
    }

    private static string FindRepoRoot()
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir is not null && !File.Exists(Path.Combine(dir.FullName, "AcmeCatalog.slnx")))
        {
            dir = dir.Parent;
        }
        return dir?.FullName ?? throw new InvalidOperationException("Could not locate repo root (AcmeCatalog.slnx not found above the test assembly).");
    }

    private record LoginResponseDto(string Token, string Username);
    private record ItemDto(int Id, string Name, string CreatedByDisplayName);
}
