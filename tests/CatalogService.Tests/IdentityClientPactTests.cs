using System.Net;
using CatalogService.Services;
using Microsoft.Extensions.Logging.Abstractions;
using PactNet;

namespace CatalogService.Tests;

// The one real backend-to-backend boundary in this system, formalized as a
// Pact contract — see InternalUsersController.cs and IdentityClient.cs's
// own comments, both already naming this exact interaction. Runs the real,
// unmodified IdentityClient against a local Pact mock server (no
// WireMock.Net here — IdentityClientResilienceTests.cs already owns
// resilience edge cases; this owns the actual agreed request/response
// shape) and, on a passing run, writes a real pact file for
// InternalUsersPactVerificationTests.cs (identity-service side) to verify
// against, once published to PactFlow.
[TestFixture]
[Category("Pact")]
public class IdentityClientPactTests
{
    // Arbitrary but fixed — the provider verification test seeds a real
    // user with this exact id via a provider-state parameter, so both
    // sides agree on it without either one hardcoding the other's data.
    private const string UserId = "00000000-0000-4000-8000-000000000001";

    private IPactBuilderV4 _pact = null!;

    [SetUp]
    public void SetUp()
    {
        var config = new PactConfig
        {
            PactDir = Path.Combine(FindRepoRoot(), "pacts"),
        };

        _pact = Pact.V4("catalog-service", "identity-service", config).WithHttpInteractions();
    }

    [Test]
    public async Task GetDisplayNamesAsync_ResolvesAKnownUser_MatchesTheRealContract()
    {
        _pact
            .UponReceiving("a request to resolve one known user id")
            .Given("a user exists", new Dictionary<string, string> { ["id"] = UserId, ["username"] = "pact-fixture-user" })
            .WithRequest(HttpMethod.Get, "/internal/users")
            .WithQuery("ids", UserId)
            .WillRespond()
            .WithStatus(HttpStatusCode.OK)
            .WithJsonBody(new[] { new { id = UserId, username = "pact-fixture-user" } });

        await _pact.VerifyAsync(async ctx =>
        {
            using var httpClient = new HttpClient { BaseAddress = ctx.MockServerUri };
            var client = new IdentityClient(httpClient, NullLogger<IdentityClient>.Instance);

            var result = await client.GetDisplayNamesAsync([UserId]);

            Assert.That(result[UserId], Is.EqualTo("pact-fixture-user"));
        });
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
}
