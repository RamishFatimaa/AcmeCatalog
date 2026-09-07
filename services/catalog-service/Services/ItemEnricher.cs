using CatalogService.Interfaces;
using CatalogService.Models;

namespace CatalogService.Services;

// The actual unit under test for this service's "mock the dependency" story:
// real object, real logic (batch the distinct ids, one call, map results
// back), with IIdentityClient as the one thing a test replaces. Classical
// style, not mockist — this class isn't itself mocked anywhere, only what it
// depends on is.
public class ItemEnricher
{
    private readonly IIdentityClient _identityClient;

    public ItemEnricher(IIdentityClient identityClient)
    {
        _identityClient = identityClient;
    }

    public async Task<IReadOnlyList<ItemResponse>> EnrichAsync(IReadOnlyList<Item> items, CancellationToken cancellationToken = default)
    {
        var distinctUserIds = items
            .Select(i => i.CreatedByUserId)
            .Where(id => id is not null)
            .Select(id => id!)
            .Distinct()
            .ToList();

        var displayNames = distinctUserIds.Count > 0
            ? await _identityClient.GetDisplayNamesAsync(distinctUserIds, cancellationToken)
            : new Dictionary<string, string>();

        return items.Select(i => ItemResponse.From(i, displayNames)).ToList();
    }

    public async Task<ItemResponse> EnrichAsync(Item item, CancellationToken cancellationToken = default)
    {
        var enriched = await EnrichAsync(new List<Item> { item }, cancellationToken);
        return enriched[0];
    }
}
