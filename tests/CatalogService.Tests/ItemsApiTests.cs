using System.IdentityModel.Tokens.Jwt;
using System.Net;
using System.Net.Http.Json;
using System.Security.Claims;
using System.Text;
using CatalogService.Data;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.IdentityModel.Tokens;

namespace CatalogService.Tests;

// Integration-level, same shape as IdentityService.Tests/AuthApiTests.cs:
// WebApplicationFactory<Program> against catalog-service's own real pipeline
// (real routing, real [Authorize], real JWT bearer middleware) and a
// throwaway SQLite file, not the service class in isolation the way
// ItemServiceTests.cs already does. Nothing before this test class ever
// exercised ItemsApiController itself in C# — only externally, via the
// frontend's Cypress items-api.cy.ts hitting a live running instance.
//
// catalog-service never issues its own tokens, so tokens here are minted
// directly using the same signing key/issuer/audience it already trusts
// (read from the factory's own configuration, not re-hardcoded, so this
// can't silently drift from what Program.cs actually validates) — proving
// catalog-service correctly validates any token shaped like what
// identity-service issues, the same way IdentityClientResilienceTests.cs
// already stands in for identity-service at the HTTP layer elsewhere.
[TestFixture]
[Category("Integration")]
public class ItemsApiTests
{
    private WebApplicationFactory<Program> _factory = null!;
    private HttpClient _client = null!;
    private string _dbPath = null!;
    private string _signingKey = null!;
    private string? _issuer;
    private string? _audience;

    [SetUp]
    public void SetUp()
    {
        _dbPath = Path.Combine(Path.GetTempPath(), $"catalog-test-{Guid.NewGuid()}.db");

        _factory = new WebApplicationFactory<Program>().WithWebHostBuilder(builder =>
        {
            builder.UseEnvironment("Development");
            builder.UseSetting("ConnectionStrings:DefaultConnection", $"Data Source={_dbPath}");
            // Points at a port nothing listens on so this suite is self-contained
            // and deterministic — whether a real identity-service happens to be
            // running on the machine must never affect these tests, which are
            // about catalog-service's own auth pipeline, not enrichment (already
            // covered by ItemEnricherTests.cs / IdentityClientResilienceTests.cs).
            builder.UseSetting("Services:IdentityServiceBaseUrl", "http://localhost:1");
        });

        _client = _factory.CreateClient();

        var config = _factory.Services.GetRequiredService<IConfiguration>();
        _signingKey = config["Jwt:Key"]!;
        _issuer = config["Jwt:Issuer"];
        _audience = config["Jwt:Audience"];
    }

    [TearDown]
    public void TearDown()
    {
        _client.Dispose();
        _factory.Dispose();
        if (File.Exists(_dbPath))
        {
            File.Delete(_dbPath);
        }
    }

    private string MintToken(
        string subjectId = "test-user-id",
        TimeSpan? expiresIn = null,
        string? signingKey = null,
        string? issuer = null)
    {
        var expires = DateTime.UtcNow.Add(expiresIn ?? TimeSpan.FromMinutes(60));
        var credentials = new SigningCredentials(
            new SymmetricSecurityKey(Encoding.UTF8.GetBytes(signingKey ?? _signingKey)),
            SecurityAlgorithms.HmacSha256);

        var token = new JwtSecurityToken(
            issuer: issuer ?? _issuer,
            audience: _audience,
            claims: [new Claim(JwtRegisteredClaimNames.Sub, subjectId)],
            notBefore: expires.AddHours(-2),
            expires: expires,
            signingCredentials: credentials);

        return new JwtSecurityTokenHandler().WriteToken(token);
    }

    private void Authorize(string token) =>
        _client.DefaultRequestHeaders.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", token);

    private static object ValidItemBody(string name) => new
    {
        name,
        price = 12.5,
        description = "Created by ItemsApiTests",
        category = "Electronics"
    };

    [Test]
    public async Task GetAll_NoToken_ReturnsSeededItems()
    {
        var response = await _client.GetAsync("/api/items");

        Assert.That(response.StatusCode, Is.EqualTo(HttpStatusCode.OK));
        var items = await response.Content.ReadFromJsonAsync<List<ItemDto>>();
        Assert.That(items, Is.Not.Null.And.Not.Empty);
    }

    [Test]
    public async Task Create_NoToken_Returns401()
    {
        var response = await _client.PostAsJsonAsync("/api/items", ValidItemBody("No Token Item"));

        Assert.That(response.StatusCode, Is.EqualTo(HttpStatusCode.Unauthorized));
    }

    [Test]
    public async Task Create_ValidToken_Returns201AndSetsCreatedByFromSubClaim()
    {
        // ItemResponse deliberately never exposes the raw CreatedByUserId in
        // the API response (only the resolved CreatedByDisplayName) — asserted
        // via the persisted row directly, which also decouples this from
        // whatever identity-service would've resolved "user-abc-123" to.
        Authorize(MintToken(subjectId: "user-abc-123"));

        var response = await _client.PostAsJsonAsync("/api/items", ValidItemBody("Real Pipeline Item"));

        Assert.That(response.StatusCode, Is.EqualTo(HttpStatusCode.Created));
        var created = await response.Content.ReadFromJsonAsync<ItemDto>();

        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<CatalogDbContext>();
        var persisted = await db.Items.FirstAsync(i => i.Id == created!.Id);

        Assert.That(persisted.CreatedByUserId, Is.EqualTo("user-abc-123"),
            "the controller should read the authenticated user's sub claim, not just pass auth");
    }

    [Test]
    public async Task Create_ExpiredToken_Returns401()
    {
        // Real gap this closes: ValidateLifetime=true in Program.cs was only
        // ever implied by config, never proven against an actually-expired
        // token — nothing before this hit the real JWT bearer middleware
        // with one.
        Authorize(MintToken(expiresIn: TimeSpan.FromHours(-1)));

        var response = await _client.PostAsJsonAsync("/api/items", ValidItemBody("Expired Token Item"));

        Assert.That(response.StatusCode, Is.EqualTo(HttpStatusCode.Unauthorized));
    }

    [Test]
    public async Task Create_TokenSignedWithWrongKey_Returns401()
    {
        // Proves a token whose bytes don't match the configured signing key
        // is rejected, not just a missing token — the real trust boundary
        // between the two services, since catalog-service never calls back
        // to identity-service to check a token. (Verified this actually
        // exercises signature checking, not ValidateIssuerSigningKey
        // specifically: toggling that flag off alone didn't make this test
        // fail — the mandatory cryptographic signature check against
        // IssuerSigningKey is what actually rejects it.)
        Authorize(MintToken(signingKey: "a-completely-different-signing-key-0000000000000000"));

        var response = await _client.PostAsJsonAsync("/api/items", ValidItemBody("Forged Signature Item"));

        Assert.That(response.StatusCode, Is.EqualTo(HttpStatusCode.Unauthorized));
    }

    [Test]
    public async Task Create_TokenWithWrongIssuer_Returns401()
    {
        Authorize(MintToken(issuer: "SomeOtherIssuer"));

        var response = await _client.PostAsJsonAsync("/api/items", ValidItemBody("Wrong Issuer Item"));

        Assert.That(response.StatusCode, Is.EqualTo(HttpStatusCode.Unauthorized));
    }

    [Test]
    public async Task UpdateAndDelete_ValidToken_PersistsThroughRealPipeline()
    {
        Authorize(MintToken());

        var createResponse = await _client.PostAsJsonAsync("/api/items", ValidItemBody("Round Trip Item"));
        var created = await createResponse.Content.ReadFromJsonAsync<ItemDto>();

        var updateResponse = await _client.PutAsJsonAsync($"/api/items/{created!.Id}", new
        {
            id = created.Id,
            name = "Round Trip Item (updated)",
            price = 20.0,
            description = "Updated by ItemsApiTests",
            category = "Electronics"
        });
        Assert.That(updateResponse.StatusCode, Is.EqualTo(HttpStatusCode.NoContent));

        var afterUpdate = await _client.GetFromJsonAsync<ItemDto>($"/api/items/{created.Id}");
        Assert.That(afterUpdate!.Name, Is.EqualTo("Round Trip Item (updated)"));

        var deleteResponse = await _client.DeleteAsync($"/api/items/{created.Id}");
        Assert.That(deleteResponse.StatusCode, Is.EqualTo(HttpStatusCode.NoContent));

        var afterDelete = await _client.GetAsync($"/api/items/{created.Id}");
        Assert.That(afterDelete.StatusCode, Is.EqualTo(HttpStatusCode.NotFound));
    }

    [Test]
    public async Task UpdateAndDelete_ByADifferentAuthenticatedUser_Succeeds()
    {
        // Locks in a real product decision, confirmed with the user rather
        // than assumed: inventory is shared across all authenticated users
        // by design — ItemsApiController has [Authorize] only, deliberately
        // no ownership check (there's no CreatedByUserId comparison anywhere
        // in Update/Delete). Without this test, that's only ever provable by
        // reading the controller and noticing what's absent; this proves the
        // *intended* behavior directly, so a future ownership check added by
        // accident (e.g. copying a pattern from another app) would fail a
        // real test here instead of silently changing behavior.
        Authorize(MintToken(subjectId: "user-a"));
        var createResponse = await _client.PostAsJsonAsync("/api/items", ValidItemBody("Shared Inventory Item"));
        var created = await createResponse.Content.ReadFromJsonAsync<ItemDto>();

        Authorize(MintToken(subjectId: "user-b"));
        var updateResponse = await _client.PutAsJsonAsync($"/api/items/{created!.Id}", new
        {
            id = created.Id,
            name = "Shared Inventory Item (edited by user-b)",
            price = 30.0,
            description = "Edited by a different authenticated user than the creator",
            category = "Electronics"
        });
        Assert.That(updateResponse.StatusCode, Is.EqualTo(HttpStatusCode.NoContent),
            "any authenticated user may edit any item — no ownership check exists, by design");

        var deleteResponse = await _client.DeleteAsync($"/api/items/{created.Id}");
        Assert.That(deleteResponse.StatusCode, Is.EqualTo(HttpStatusCode.NoContent),
            "any authenticated user may delete any item — no ownership check exists, by design");
    }

    private record ItemDto(int Id, string Name, decimal Price, string Category, string CreatedByDisplayName);
}
