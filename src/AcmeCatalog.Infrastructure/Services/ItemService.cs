using AcmeCatalog.Core.Interfaces;
using AcmeCatalog.Core.Models;
using AcmeCatalog.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace AcmeCatalog.Infrastructure.Services;

public class ItemService : IItemService
{
    private readonly AcmeCatalogDbContext _context;

    public ItemService(AcmeCatalogDbContext context)
    {
        _context = context;
    }

    public async Task<IReadOnlyList<Item>> GetAllAsync()
    {
        return await _context.Items
            .OrderBy(i => i.SortOrder)
            .ToListAsync();
    }

    public async Task<IReadOnlyList<Item>> SearchAsync(string? term, string? category)
    {
        var query = _context.Items.AsQueryable();

        if (!string.IsNullOrWhiteSpace(category))
        {
            query = query.Where(i => i.Category == category);
        }

        if (!string.IsNullOrWhiteSpace(term))
        {
            var normalized = term.Trim().ToLower();
            query = query.Where(i =>
                i.Name.ToLower().Contains(normalized) ||
                i.Description.ToLower().Contains(normalized));
        }

        return await query.OrderBy(i => i.SortOrder).ToListAsync();
    }

    public async Task<Item?> GetByIdAsync(int id)
    {
        return await _context.Items.FindAsync(id);
    }

    public async Task<Item> CreateAsync(Item item)
    {
        var maxSortOrder = await _context.Items.AnyAsync()
            ? await _context.Items.MaxAsync(i => i.SortOrder)
            : -1;

        item.Id = 0;
        item.SortOrder = maxSortOrder + 1;
        item.DateAdded = DateTime.UtcNow;

        _context.Items.Add(item);
        await _context.SaveChangesAsync();
        return item;
    }

    public async Task<bool> UpdateAsync(Item item)
    {
        var existing = await _context.Items.FindAsync(item.Id);
        if (existing is null)
        {
            return false;
        }

        existing.Name = item.Name;
        existing.Price = item.Price;
        existing.Description = item.Description;
        existing.Category = item.Category;

        if (!string.IsNullOrWhiteSpace(item.ImageUrl))
        {
            existing.ImageUrl = item.ImageUrl;
        }

        await _context.SaveChangesAsync();
        return true;
    }

    public async Task<bool> DeleteAsync(int id)
    {
        var existing = await _context.Items.FindAsync(id);
        if (existing is null)
        {
            return false;
        }

        _context.Items.Remove(existing);
        await _context.SaveChangesAsync();
        return true;
    }

    public async Task<IReadOnlyList<string>> GetCategoriesAsync()
    {
        return await _context.Items
            .Select(i => i.Category)
            .Distinct()
            .OrderBy(c => c)
            .ToListAsync();
    }

    public async Task ReorderAsync(IReadOnlyList<int> orderedIds)
    {
        if (orderedIds.Count == 0)
        {
            return;
        }

        var items = await _context.Items
            .Where(i => orderedIds.Contains(i.Id))
            .ToListAsync();

        // Redistribute this subset's own SortOrder values (in their original
        // ascending order) across the new ordering, so items outside the
        // dragged subset keep their relative position.
        var availableSlots = items.Select(i => i.SortOrder).OrderBy(v => v).ToList();

        for (var i = 0; i < orderedIds.Count; i++)
        {
            var item = items.FirstOrDefault(x => x.Id == orderedIds[i]);
            if (item is not null && i < availableSlots.Count)
            {
                item.SortOrder = availableSlots[i];
            }
        }

        await _context.SaveChangesAsync();
    }
}
