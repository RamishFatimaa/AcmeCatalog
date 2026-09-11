using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;

namespace IdentityService.Tests;

// Integration-level, not unit-level, on purpose: UserManager/SignInManager
// are concrete ASP.NET Identity classes that aren't practical to unit-mock,
// so this exercises the real Identity stack against a real (throwaway)
// SQLite file via WebApplicationFactory<Program> — the same shape of test
// api/*.cy.ts already uses on the frontend against a real running backend.
[TestFixture]
[Category("Integration")]
public class AuthApiTests
{
    private WebApplicationFactory<Program> _factory = null!;
    private HttpClient _client = null!;
    private string _dbPath = null!;

    [SetUp]
    public void SetUp()
    {
        _dbPath = Path.Combine(Path.GetTempPath(), $"identity-test-{Guid.NewGuid()}.db");

        _factory = new WebApplicationFactory<Program>().WithWebHostBuilder(builder =>
        {
            builder.UseEnvironment("Development");
            // ConfigureAppConfiguration's AddInMemoryCollection does not
            // reliably win here: Program.cs reads builder.Configuration
            // eagerly (top-level minimal-hosting code), before
            // WebApplicationFactory's customization hook runs, so it was
            // silently still opening the default identity.db instead of a
            // fresh per-test file. UseSetting applies early enough to
            // actually be visible by the time Program.cs reads it.
            builder.UseSetting("ConnectionStrings:DefaultConnection", $"Data Source={_dbPath}");
        });

        _client = _factory.CreateClient();
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

    [Test]
    public async Task Login_SeededTestUser_ReturnsToken()
    {
        var response = await _client.PostAsJsonAsync("/api/auth/login", new { username = "testuser", password = "Test123!" });

        Assert.That(response.StatusCode, Is.EqualTo(HttpStatusCode.OK));
        var body = await response.Content.ReadFromJsonAsync<LoginResponseDto>();
        Assert.That(body!.Token, Is.Not.Empty);
        Assert.That(body.Username, Is.EqualTo("testuser"));
    }

    [Test]
    public async Task Login_WrongPassword_Returns401()
    {
        var response = await _client.PostAsJsonAsync("/api/auth/login", new { username = "testuser", password = "WrongPassword!" });

        Assert.That(response.StatusCode, Is.EqualTo(HttpStatusCode.Unauthorized));
    }

    [Test]
    public async Task Register_NewUser_ReturnsTokenImmediately()
    {
        var response = await _client.PostAsJsonAsync("/api/auth/register", new
        {
            username = "newperson",
            email = "newperson@example.com",
            password = "Str0ng!Pass",
            confirmPassword = "Str0ng!Pass"
        });

        Assert.That(response.StatusCode, Is.EqualTo(HttpStatusCode.OK));
        var body = await response.Content.ReadFromJsonAsync<LoginResponseDto>();
        Assert.That(body!.Username, Is.EqualTo("newperson"));
    }

    [Test]
    public async Task Register_DuplicateUsername_ReturnsValidationProblem()
    {
        await _client.PostAsJsonAsync("/api/auth/register", new
        {
            username = "duplicate",
            email = "first@example.com",
            password = "Str0ng!Pass",
            confirmPassword = "Str0ng!Pass"
        });

        var response = await _client.PostAsJsonAsync("/api/auth/register", new
        {
            username = "duplicate",
            email = "second@example.com",
            password = "Str0ng!Pass",
            confirmPassword = "Str0ng!Pass"
        });

        Assert.That(response.StatusCode, Is.EqualTo(HttpStatusCode.BadRequest));
    }

    [Test]
    public async Task InternalUsers_KnownAndUnknownIds_OmitsUnknownRatherThanErroring()
    {
        var loginResponse = await _client.PostAsJsonAsync("/api/auth/login", new { username = "testuser", password = "Test123!" });
        var login = await loginResponse.Content.ReadFromJsonAsync<LoginResponseDto>();

        var meResponse = await _client.SendAsync(new HttpRequestMessage(HttpMethod.Get, "/api/auth/me")
        {
            Headers = { { "Authorization", $"Bearer {login!.Token}" } }
        });
        Assert.That(meResponse.StatusCode, Is.EqualTo(HttpStatusCode.OK));

        // /internal/users looks up by id, not username — pull the real id via
        // the JWT's own sub claim rather than guessing it.
        var userId = new System.IdentityModel.Tokens.Jwt.JwtSecurityTokenHandler()
            .ReadJwtToken(login.Token)
            .Claims.First(c => c.Type == "sub").Value;

        var response = await _client.GetAsync($"/internal/users?ids={userId},nonexistent-id");
        var users = await response.Content.ReadFromJsonAsync<List<UserLookupDto>>();

        Assert.That(users, Has.Count.EqualTo(1));
        Assert.That(users![0].Username, Is.EqualTo("testuser"));
    }

    private record LoginResponseDto(string Token, string Username);
    private record UserLookupDto(string Id, string Username);
}
