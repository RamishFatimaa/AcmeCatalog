using System.Diagnostics;
using System.Net.Http.Json;
using IdentityService.Data;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using PactNet.Verifier;

namespace IdentityService.Tests;

// The provider side of every contract published against identity-service,
// regardless of consumer — currently catalog-service's IdentityClientPactTests.cs
// (/internal/users) and frontend's auth.consumer.pact.test.ts (/api/auth/login).
// WithPactBrokerSource has no consumer filter, so this verifies whatever's
// published for "identity-service" as provider, from either or both.
// PactNet's verifier makes real HTTP requests through its native (Rust FFI)
// core, not in-process calls — so this needs a REAL listening endpoint, not
// WebApplicationFactory's in-memory TestServer. Reuses the exact "boot as a
// real OS process, health-poll /health" pattern tests/IntegrationTests
// already proves works, rather than fight WebApplicationFactory into
// binding a real Kestrel port.
[TestFixture]
[Category("Pact")]
public class IdentityServiceProviderVerificationTests
{
    private const string ProviderUrl = "http://localhost:5601";

    private Process? _providerProcess;
    private string _dbPath = null!;
    private WebApplication? _stateApp;
    private string _stateUrl = null!;

    [OneTimeSetUp]
    public async Task OneTimeSetUp()
    {
        var repoRoot = FindRepoRoot();
        _dbPath = Path.Combine(Path.GetTempPath(), $"identity-pact-{Guid.NewGuid()}.db");

        _providerProcess = StartService(repoRoot, _dbPath);
        await WaitForHealth(ProviderUrl);

        // A tiny local endpoint PactNet's verifier POSTs to before each
        // interaction that declares a provider state (WithProviderStateUrl
        // below) — seeds a real IdentityUser directly into the SAME SQLite
        // file the real identity-service process above is reading from,
        // using the exact id/username the consumer's published contract
        // asked for, so both sides agree on real data without either one
        // hardcoding the other's.
        var stateBuilder = WebApplication.CreateBuilder();
        stateBuilder.WebHost.UseUrls("http://127.0.0.1:0");
        _stateApp = stateBuilder.Build();
        _stateApp.MapPost("/provider-states", async (HttpContext ctx) =>
        {
            var raw = await new StreamReader(ctx.Request.Body).ReadToEndAsync();
            var payload = System.Text.Json.JsonSerializer.Deserialize<ProviderStateRequest>(
                raw, new System.Text.Json.JsonSerializerOptions { PropertyNameCaseInsensitive = true });

            // One branch per real, distinct provider state — deliberately
            // not sharing a state name (or a fixture username) across
            // interactions with different param shapes (id+username for
            // the internal lookup vs. username+password for login), even
            // though both are "a user exists" in casual English. Two
            // consumers seeding into the same identity-service database in
            // one verification run means their fixture usernames must be
            // distinct too — confirmed the hard way (both first used
            // "pact-fixture-user" and collided on NormalizedUserName).
            // Add a new branch here, with its own distinct state name and
            // fixture username, for each future interaction.
            if (payload?.State == "a user exists" && payload.Params is not null)
            {
                await SeedUserAsync(_dbPath, payload.Params["id"], payload.Params["username"], "Test123!");
            }
            else if (payload?.State == "a user with valid login credentials exists" && payload.Params is not null)
            {
                await SeedUserAsync(_dbPath, Guid.NewGuid().ToString(), payload.Params["username"], payload.Params["password"]);
            }

            return Results.Ok(new { });
        });
        await _stateApp.StartAsync();
        _stateUrl = $"{_stateApp.Urls.First()}/provider-states";
    }

    [OneTimeTearDown]
    public async Task OneTimeTearDown()
    {
        if (_stateApp is not null)
        {
            await _stateApp.StopAsync();
            await _stateApp.DisposeAsync();
        }
        KillProcessTree(_providerProcess);
        _providerProcess?.Dispose();
        TryDelete(_dbPath);
    }

    [Test]
    public void IdentityService_SatisfiesAllPublishedConsumerContracts()
    {
        var brokerUrl = Environment.GetEnvironmentVariable("PACT_BROKER_BASE_URL");
        var brokerToken = Environment.GetEnvironmentVariable("PACT_BROKER_TOKEN");
        Assert.That(brokerUrl, Is.Not.Null.And.Not.Empty, "PACT_BROKER_BASE_URL must be set to verify against the published contract.");
        Assert.That(brokerToken, Is.Not.Null.And.Not.Empty, "PACT_BROKER_TOKEN must be set to verify against the published contract.");

        // A literal "test" string with no branch, published here previously,
        // is exactly why PactFlow's "Can I Deploy?" reported "no versions
        // exist for that branch" — real, confirmed directly against the
        // broker's own UI, not a hypothetical. A real provider version
        // (the actual commit being verified) tagged to the actual branch
        // it's running on is what that check needs to have anything to
        // find. "local"/"local-branch" are honest fallbacks for a run
        // outside CI, not silently wrong defaults.
        var providerVersion = Environment.GetEnvironmentVariable("GITHUB_SHA") ?? "local";
        var providerBranch = Environment.GetEnvironmentVariable("GITHUB_REF_NAME") ?? "local-branch";

        var config = new PactVerifierConfig();

        using var verifier = new PactVerifier("identity-service", config);
        verifier
            .WithHttpEndpoint(new Uri(ProviderUrl))
            .WithPactBrokerSource(new Uri(brokerUrl!), options =>
            {
                options.TokenAuthentication(brokerToken!);
                options.EnablePending();
                options.PublishResults(providerVersion, publish => publish.ProviderBranch(providerBranch));
            })
            .WithProviderStateUrl(new Uri(_stateUrl))
            .Verify();
    }

    private static async Task SeedUserAsync(string dbPath, string id, string username, string password)
    {
        var options = new DbContextOptionsBuilder<IdentityServiceDbContext>()
            .UseSqlite($"Data Source={dbPath}")
            .Options;
        await using var context = new IdentityServiceDbContext(options);
        await context.Database.EnsureCreatedAsync();

        if (!await context.Users.AnyAsync(u => u.Id == id))
        {
            var user = new IdentityUser
            {
                Id = id,
                UserName = username,
                NormalizedUserName = username.ToUpperInvariant(),
                Email = $"{username}@example.com",
                NormalizedEmail = $"{username}@example.com".ToUpperInvariant(),
            };
            user.PasswordHash = new PasswordHasher<IdentityUser>().HashPassword(user, password);
            context.Users.Add(user);
            await context.SaveChangesAsync();
        }
    }

    private static Process StartService(string repoRoot, string dbPath)
    {
        var psi = new ProcessStartInfo("dotnet", $"run --project services/identity-service --urls {ProviderUrl}")
        {
            WorkingDirectory = repoRoot,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
        };
        psi.Environment["ASPNETCORE_ENVIRONMENT"] = "Development";
        psi.Environment["ConnectionStrings__DefaultConnection"] = $"Data Source={dbPath}";

        var process = Process.Start(psi) ?? throw new InvalidOperationException("Failed to start identity-service process.");
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
            // best-effort cleanup
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

    private record ProviderStateRequest(string? State, string? Action, Dictionary<string, string>? Params);
}
