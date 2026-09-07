using AcmeCatalog.Core.Models;

namespace AcmeCatalog.Core.Interfaces;

public interface IItemService
{
    Task<IReadOnlyList<Item>> SearchAsync(string? term, string? category, string? sort = null, decimal? minPrice = null, decimal? maxPrice = null);

    Task<Item?> GetByIdAsync(int id);

    Task<Item> CreateAsync(Item item);

    Task<bool> UpdateAsync(Item item);

    Task<Item?> UpdateImageAsync(int id, string imageUrl);

    Task<bool> DeleteAsync(int id);

    Task<IReadOnlyList<string>> GetCategoriesAsync();

    Task ReorderAsync(IReadOnlyList<int> orderedIds);
}
