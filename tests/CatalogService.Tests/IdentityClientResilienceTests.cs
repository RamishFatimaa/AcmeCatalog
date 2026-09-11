using System.Diagnostics;
using CatalogService.Interfaces;
using CatalogService.Services;
using Microsoft.Extensions.DependencyInjection;
using WireMock.RequestBuilders;
using WireMock.ResponseBuilders;
using WireMock.Server;

namespace CatalogService.Tests;

// HTTP-level stubbing of identity-service via WireMock.Net, exercising the
// *actual* AddIdentityServiceClient pipeline from Program.cs — not a
// hand-rolled HttpClient — so these tests prove the real resilience policy
// behaves correctly, the backend equivalent of what cy.intercept()'s
// network-shaping tests do for the frontend. Real timing throughout: no
// fakes for the clock, because the thing under test is whether these
// policies behave correctly against real elapsed time.
[TestFixture]
[Category("Integration")]
public class IdentityClientResilienceTests
{
    private WireMockServer _server = null!;
    private ServiceProvider _provider = null!;
    private IIdentityClient _client = null!;

    [SetUp]
    public void SetUp()
    {
        _server = WireMockServer.Start();

        var services = new ServiceCollection();
        services.AddLogging();
        services.AddIdentityServiceClient(_server.Url!);
        _provider = services.BuildServiceProvider();

        _client = _provider.GetRequiredService<IIdentityClient>();
    }

    [TearDown]
    public void TearDown()
    {
        _provider.Dispose();
        _server.Stop();
        _server.Dispose();
    }

    [Test]
    public async Task GetDisplayNamesAsync_HealthyResponse_ReturnsResolvedNames()
    {
        _server
            .Given(Request.Create().WithPath("/internal/users").UsingGet())
            .RespondWith(Response.Create()
                .WithStatusCode(200)
                .WithHeader("Content-Type", "application/json")
                .WithBody("""[{"id":"user-1","username":"alice"}]"""));

        var result = await _client.GetDisplayNamesAsync(new[] { "user-1" });

        Assert.That(result["user-1"], Is.EqualTo("alice"));
    }

    [Test]
    public async Task GetDisplayNamesAsync_ServerError_FallsBackToEmptyRatherThanThrowing()
    {
        _server
            .Given(Request.Create().WithPath("/internal/users").UsingGet())
            .RespondWith(Response.Create().WithStatusCode(500));

        var result = await _client.GetDisplayNamesAsync(new[] { "user-1" });

        Assert.That(result, Is.Empty);
    }

    [Test]
    public async Task GetDisplayNamesAsync_MalformedBody_FallsBackToEmptyRatherThanThrowing()
    {
        _server
            .Given(Request.Create().WithPath("/internal/users").UsingGet())
            .RespondWith(Response.Create()
                .WithStatusCode(200)
                .WithHeader("Content-Type", "application/json")
                .WithBody("not valid json"));

        var result = await _client.GetDisplayNamesAsync(new[] { "user-1" });

        Assert.That(result, Is.Empty);
    }

    [Test]
    public async Task GetDisplayNamesAsync_ResponseSlowerThanTimeout_FallsBackWellBeforeTheDelayElapses()
    {
        // The actual claim under test: a 2s-configured timeout means a
        // caller never waits anywhere near this 6s delay — proving the
        // timeout is wired into the real pipeline, not just present in
        // config and silently unused.
        _server
            .Given(Request.Create().WithPath("/internal/users").UsingGet())
            .RespondWith(Response.Create()
                .WithStatusCode(200)
                .WithHeader("Content-Type", "application/json")
                .WithBody("""[{"id":"user-1","username":"alice"}]""")
                .WithDelay(TimeSpan.FromSeconds(6)));

        var stopwatch = Stopwatch.StartNew();
        var result = await _client.GetDisplayNamesAsync(new[] { "user-1" });
        stopwatch.Stop();

        Assert.That(result, Is.Empty);
        Assert.That(stopwatch.Elapsed, Is.LessThan(TimeSpan.FromSeconds(4)),
            $"expected the timeout to cut this off well under 6s, took {stopwatch.Elapsed}");
    }

    [Test]
    public async Task GetDisplayNamesAsync_TransientFailureThenSuccess_RetryRecoversTheRealName()
    {
        // The only existing failure test (ServerError_...) hits 500 on every
        // call, which never distinguishes "retry fired and helped" from
        // "retry is configured but pointless". WireMock's scenario/state
        // machine is what lets a single client call see two different
        // responses across its internal retry attempt.
        const string scenario = "one-transient-failure";
        _server
            .Given(Request.Create().WithPath("/internal/users").UsingGet())
            .InScenario(scenario)
            .WillSetStateTo("failed-once")
            .RespondWith(Response.Create().WithStatusCode(500));

        _server
            .Given(Request.Create().WithPath("/internal/users").UsingGet())
            .InScenario(scenario)
            .WhenStateIs("failed-once")
            .RespondWith(Response.Create()
                .WithStatusCode(200)
                .WithHeader("Content-Type", "application/json")
                .WithBody("""[{"id":"user-1","username":"alice"}]"""));

        var result = await _client.GetDisplayNamesAsync(new[] { "user-1" });

        Assert.That(result["user-1"], Is.EqualTo("alice"),
            "the configured single retry (MaxRetryAttempts=1) should have absorbed one transient 500 and returned the real name, not fallen back to empty");
    }

    [Test]
    public async Task GetDisplayNamesAsync_AfterBreakDurationElapses_CircuitClosesAndResolvesAgain()
    {
        // The docs claim the breaker "closes again" once identity-service
        // recovers — a real production question (does this ever come back,
        // or degrade permanently until restart) that nothing currently
        // asserts. Uses its own short-BreakDuration client so the test
        // doesn't need to wait out the real 15s production value.
        var services = new ServiceCollection();
        services.AddLogging();
        services.AddIdentityServiceClient(_server.Url!, breakDuration: TimeSpan.FromSeconds(1));
        await using var provider = services.BuildServiceProvider();
        var client = provider.GetRequiredService<IIdentityClient>();

        _server
            .Given(Request.Create().WithPath("/internal/users").UsingGet())
            .RespondWith(Response.Create().WithStatusCode(500));

        for (var i = 0; i < 10; i++)
        {
            await client.GetDisplayNamesAsync(new[] { "user-1" });
        }

        _server.ResetMappings();
        _server
            .Given(Request.Create().WithPath("/internal/users").UsingGet())
            .RespondWith(Response.Create()
                .WithStatusCode(200)
                .WithHeader("Content-Type", "application/json")
                .WithBody("""[{"id":"user-1","username":"alice"}]"""));

        await Task.Delay(TimeSpan.FromSeconds(1.5));

        var result = await client.GetDisplayNamesAsync(new[] { "user-1" });

        Assert.That(result["user-1"], Is.EqualTo("alice"),
            "once BreakDuration has elapsed and identity-service is healthy again, the breaker should close and resolve real names, not stay open forever");
    }

    [Test]
    public async Task GetDisplayNamesAsync_RepeatedFailures_OpensCircuitAndStopsCallingOut()
    {
        _server
            .Given(Request.Create().WithPath("/internal/users").UsingGet())
            .RespondWith(Response.Create().WithStatusCode(500));

        // MinimumThroughput=3 within a 10s SamplingDuration is when the
        // breaker becomes *eligible* to open, not a guarantee of the exact
        // call at which Polly's sliding-window sampling evaluates and trips
        // it — driving well past that floor (10 calls, each retried once
        // internally) makes the assertion robust to that internal timing
        // rather than pinned to a specific call index.
        for (var i = 0; i < 10; i++)
        {
            await _client.GetDisplayNamesAsync(new[] { "user-1" });
        }

        var requestsSoFar = _server.LogEntries.Count();
        _server.ResetLogEntries();

        // Once genuinely open, further calls fail fast locally without
        // reaching WireMock.Net at all — proven by request count, not timing.
        for (var i = 0; i < 5; i++)
        {
            await _client.GetDisplayNamesAsync(new[] { "user-1" });
        }

        var requestsAfterBreakerShouldBeOpen = _server.LogEntries.Count();

        Assert.That(requestsAfterBreakerShouldBeOpen, Is.LessThan(5),
            $"expected the open circuit to skip most of 5 calls; {requestsSoFar} requests landed before reset, {requestsAfterBreakerShouldBeOpen} after");
    }
}
