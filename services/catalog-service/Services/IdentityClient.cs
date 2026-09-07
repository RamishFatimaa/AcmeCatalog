using System.Net.Http.Json;
using CatalogService.Interfaces;

namespace CatalogService.Services;

public class IdentityClient : IIdentityClient
{
    private readonly HttpClient _httpClient;
    private readonly ILogger<IdentityClient> _logger;

    public IdentityClient(HttpClient httpClient, ILogger<IdentityClient> logger)
    {
        _httpClient = httpClient;
        _logger = logger;
    }

    public async Task<IReadOnlyDictionary<string, string>> GetDisplayNamesAsync(IReadOnlyCollection<string> userIds, CancellationToken cancellationToken = default)
    {
        if (userIds.Count == 0)
        {
            return new Dictionary<string, string>();
        }

        try
        {
            // One request for the whole batch — this is the thing tests assert
            // on to prove callers aren't doing N+1 lookups per item.
            var query = string.Join(',', userIds.Distinct());
            var response = await _httpClient.GetAsync($"/internal/users?ids={Uri.EscapeDataString(query)}", cancellationToken);

            if (!response.IsSuccessStatusCode)
            {
                _logger.LogWarning("identity-service returned {StatusCode} resolving {Count} user id(s); falling back to unresolved names.", response.StatusCode, userIds.Count);
                return new Dictionary<string, string>();
            }

            var users = await response.Content.ReadFromJsonAsync<List<UserLookup>>(cancellationToken: cancellationToken)
                ?? new List<UserLookup>();

            return users.ToDictionary(u => u.Id, u => u.Username);
        }
        catch (Exception ex)
        {
            // Covers the resilience pipeline's own exceptions (timeout,
            // open circuit) as well as a raw connection failure — all of
            // them mean the same thing to a caller: no names this time,
            // not a reason to fail the catalog request.
            _logger.LogWarning(ex, "Failed to resolve {Count} user id(s) from identity-service; falling back to unresolved names.", userIds.Count);
            return new Dictionary<string, string>();
        }
    }

    // Mirrors identity-service's UserLookupResponse — the actual contract
    // Phase 3's Pact test formalizes.
    private record UserLookup(string Id, string Username);
}
