using AcmeCatalog.Core.Models;

namespace AcmeCatalog.Core.Interfaces;

public interface IItemService
{
    Task<IReadOnlyList<Item>> GetAllAsync();

    Task<IReadOnlyList<Item>> SearchAsync(string? term, string? category);

    Task<Item?> GetByIdAsync(int id);

    Task<Item> CreateAsync(Item item);

    Task<bool> UpdateAsync(Item item);

    Task<bool> DeleteAsync(int id);

    Task<IReadOnlyList<string>> GetCategoriesAsync();

    Task ReorderAsync(IReadOnlyList<int> orderedIds);
}
