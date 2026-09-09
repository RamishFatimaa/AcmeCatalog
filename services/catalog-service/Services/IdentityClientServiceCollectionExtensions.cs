using CatalogService.Interfaces;
using Polly;
using Polly.CircuitBreaker;
using Polly.Timeout;

namespace CatalogService.Services;

public static class IdentityClientServiceCollectionExtensions
{
    // Factored out of Program.cs so the exact production resilience pipeline
    // — not a hand-copied stand-in — is what the WireMock.Net-backed tests
    // in CatalogService.Tests actually exercise, just pointed at a stub
    // server instead of the real identity-service. breakDuration is
    // overridable so a test can prove circuit-breaker recovery without
    // waiting out the real 15s in every run; Program.cs's call site doesn't
    // pass it, so production behavior is unchanged.
    public static void AddIdentityServiceClient(this IServiceCollection services, string baseUrl, TimeSpan? breakDuration = null)
    {
        services.AddHttpClient<IIdentityClient, IdentityClient>(client =>
        {
            client.BaseAddress = new Uri(baseUrl);
        })
        .AddResilienceHandler("identity-service-pipeline", pipelineBuilder =>
        {
            pipelineBuilder.AddTimeout(TimeSpan.FromSeconds(2));

            pipelineBuilder.AddRetry(new Polly.Retry.RetryStrategyOptions<HttpResponseMessage>
            {
                MaxRetryAttempts = 1,
                Delay = TimeSpan.FromMilliseconds(200),
                BackoffType = DelayBackoffType.Constant,
                // HttpClient doesn't throw on a non-success status code — it
                // just returns the response — so HandleResult is what
                // actually catches a 500 (or any error status) here, not
                // just Handle<HttpRequestException> for connection-level
                // failures. Missing this meant retry/circuit-breaker never
                // engaged for ordinary HTTP error responses at all, caught
                // by IdentityClientResilienceTests deliberately hitting a 500.
                ShouldHandle = new PredicateBuilder<HttpResponseMessage>()
                    .Handle<TimeoutRejectedException>()
                    .Handle<HttpRequestException>()
                    .HandleResult(response => !response.IsSuccessStatusCode)
            });

            pipelineBuilder.AddCircuitBreaker(new CircuitBreakerStrategyOptions<HttpResponseMessage>
            {
                FailureRatio = 0.5,
                MinimumThroughput = 3,
                SamplingDuration = TimeSpan.FromSeconds(10),
                BreakDuration = breakDuration ?? TimeSpan.FromSeconds(15),
                ShouldHandle = new PredicateBuilder<HttpResponseMessage>()
                    .Handle<TimeoutRejectedException>()
                    .Handle<HttpRequestException>()
                    .HandleResult(response => !response.IsSuccessStatusCode)
            });
        });
    }
}
