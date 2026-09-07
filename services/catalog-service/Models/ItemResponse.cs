namespace CatalogService.Models;

// The shape catalog-service actually returns from the API — Item itself
// stays a clean EF entity with a bare CreatedByUserId; this is where that id
// becomes the human-readable name the frontend shows, one way or another.
public class ItemResponse
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public decimal Price { get; set; }
    public string Description { get; set; } = string.Empty;
    public string Category { get; set; } = string.Empty;
    public string? ImageUrl { get; set; }
    public int SortOrder { get; set; }
    public DateTime DateAdded { get; set; }
    public string CreatedByDisplayName { get; set; } = "Unknown";

    public static ItemResponse From(Item item, IReadOnlyDictionary<string, string> displayNames)
    {
        var resolvedName = item.CreatedByUserId is not null && displayNames.TryGetValue(item.CreatedByUserId, out var name)
            ? name
            : "Unknown";

        return new ItemResponse
        {
            Id = item.Id,
            Name = item.Name,
            Price = item.Price,
            Description = item.Description,
            Category = item.Category,
            ImageUrl = item.ImageUrl,
            SortOrder = item.SortOrder,
            DateAdded = item.DateAdded,
            CreatedByDisplayName = resolvedName
        };
    }
}
