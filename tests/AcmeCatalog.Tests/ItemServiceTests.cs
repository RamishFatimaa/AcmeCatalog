using AcmeCatalog.Core.Models;
using AcmeCatalog.Infrastructure.Data;
using AcmeCatalog.Infrastructure.Services;
using Microsoft.EntityFrameworkCore;

namespace AcmeCatalog.Tests;

public class ItemServiceTests
{
    private AcmeCatalogDbContext _context = null!;
    private ItemService _service = null!;

    [SetUp]
    public void SetUp()
    {
        var options = new DbContextOptionsBuilder<AcmeCatalogDbContext>()
            .UseInMemoryDatabase(databaseName: Guid.NewGuid().ToString())
            .Options;

        _context = new AcmeCatalogDbContext(options);
        _service = new ItemService(_context);
    }

    [TearDown]
    public void TearDown()
    {
        _context.Dispose();
    }

    private async Task<Item> SeedItemAsync(string name, string category, decimal price, int sortOrder)
    {
        var item = new Item
        {
            Name = name,
            Category = category,
            Price = price,
            Description = $"Description for {name}",
            SortOrder = sortOrder,
            ImageUrl = "https://example.com/image.jpg"
        };

        _context.Items.Add(item);
        await _context.SaveChangesAsync();
        return item;
    }

    [Test]
    public async Task GetAllAsync_ReturnsItemsOrderedBySortOrder()
    {
        await SeedItemAsync("Charlie", Categories.Books, 10m, sortOrder: 2);
        await SeedItemAsync("Alpha", Categories.Books, 10m, sortOrder: 0);
        await SeedItemAsync("Bravo", Categories.Books, 10m, sortOrder: 1);

        var result = await _service.GetAllAsync();

        Assert.That(result.Select(i => i.Name), Is.EqualTo(new[] { "Alpha", "Bravo", "Charlie" }));
    }

    [Test]
    public async Task GetByIdAsync_ExistingId_ReturnsItem()
    {
        var seeded = await SeedItemAsync("Widget", Categories.Electronics, 25m, 0);

        var result = await _service.GetByIdAsync(seeded.Id);

        Assert.That(result, Is.Not.Null);
        Assert.That(result!.Name, Is.EqualTo("Widget"));
    }

    [Test]
    public async Task GetByIdAsync_MissingId_ReturnsNull()
    {
        var result = await _service.GetByIdAsync(999);

        Assert.That(result, Is.Null);
    }

    [Test]
    public async Task CreateAsync_FirstItem_AssignsSortOrderZero()
    {
        var item = new Item
        {
            Name = "New Item",
            Category = Categories.ToysAndGames,
            Price = 15m,
            Description = "A brand new item"
        };

        var created = await _service.CreateAsync(item);

        Assert.That(created.Id, Is.GreaterThan(0));
        Assert.That(created.SortOrder, Is.EqualTo(0));
    }

    [Test]
    public async Task CreateAsync_AppendsToEndOfExistingSortOrder()
    {
        await SeedItemAsync("First", Categories.Books, 10m, sortOrder: 0);
        await SeedItemAsync("Second", Categories.Books, 10m, sortOrder: 3);

        var created = await _service.CreateAsync(new Item
        {
            Name = "Third",
            Category = Categories.Books,
            Price = 12m,
            Description = "Newest item"
        });

        Assert.That(created.SortOrder, Is.EqualTo(4));
    }

    [Test]
    public async Task UpdateAsync_ExistingItem_UpdatesFieldsAndReturnsTrue()
    {
        var seeded = await SeedItemAsync("Old Name", Categories.HomeAndKitchen, 20m, 0);

        var updated = await _service.UpdateAsync(new Item
        {
            Id = seeded.Id,
            Name = "New Name",
            Category = Categories.SportingGoods,
            Price = 30m,
            Description = "Updated description"
        });

        var result = await _service.GetByIdAsync(seeded.Id);

        Assert.That(updated, Is.True);
        Assert.That(result!.Name, Is.EqualTo("New Name"));
        Assert.That(result.Category, Is.EqualTo(Categories.SportingGoods));
        Assert.That(result.Price, Is.EqualTo(30m));
    }

    [Test]
    public async Task UpdateAsync_MissingItem_ReturnsFalse()
    {
        var updated = await _service.UpdateAsync(new Item
        {
            Id = 999,
            Name = "Ghost",
            Category = Categories.Books,
            Price = 5m,
            Description = "Does not exist"
        });

        Assert.That(updated, Is.False);
    }

    [Test]
    public async Task UpdateAsync_BlankImageUrl_KeepsExistingImage()
    {
        var seeded = await SeedItemAsync("Item", Categories.Electronics, 10m, 0);
        var originalImage = seeded.ImageUrl;

        await _service.UpdateAsync(new Item
        {
            Id = seeded.Id,
            Name = "Item",
            Category = Categories.Electronics,
            Price = 10m,
            Description = "desc",
            ImageUrl = null
        });

        var result = await _service.GetByIdAsync(seeded.Id);

        Assert.That(result!.ImageUrl, Is.EqualTo(originalImage));
    }

    [Test]
    public async Task DeleteAsync_ExistingItem_RemovesAndReturnsTrue()
    {
        var seeded = await SeedItemAsync("To Delete", Categories.ToysAndGames, 8m, 0);

        var deleted = await _service.DeleteAsync(seeded.Id);
        var result = await _service.GetByIdAsync(seeded.Id);

        Assert.That(deleted, Is.True);
        Assert.That(result, Is.Null);
    }

    [Test]
    public async Task DeleteAsync_MissingItem_ReturnsFalse()
    {
        var deleted = await _service.DeleteAsync(999);

        Assert.That(deleted, Is.False);
    }

    [Test]
    public async Task GetCategoriesAsync_ReturnsDistinctSortedCategories()
    {
        await SeedItemAsync("A", Categories.SportingGoods, 10m, 0);
        await SeedItemAsync("B", Categories.Books, 10m, 1);
        await SeedItemAsync("C", Categories.Books, 10m, 2);

        var categories = await _service.GetCategoriesAsync();

        Assert.That(categories, Is.EqualTo(new[] { Categories.Books, Categories.SportingGoods }));
    }

    [Test]
    public async Task SearchAsync_FiltersByCategory()
    {
        await SeedItemAsync("Hammer", Categories.HomeAndKitchen, 10m, 0);
        await SeedItemAsync("Novel", Categories.Books, 10m, 1);

        var results = await _service.SearchAsync(term: null, category: Categories.Books);

        Assert.That(results, Has.Count.EqualTo(1));
        Assert.That(results[0].Name, Is.EqualTo("Novel"));
    }

    [Test]
    public async Task SearchAsync_FiltersByTerm_CaseInsensitive()
    {
        await SeedItemAsync("Wireless Headphones", Categories.Electronics, 100m, 0);
        await SeedItemAsync("Board Game", Categories.ToysAndGames, 30m, 1);

        var results = await _service.SearchAsync(term: "WIRELESS", category: null);

        Assert.That(results, Has.Count.EqualTo(1));
        Assert.That(results[0].Name, Is.EqualTo("Wireless Headphones"));
    }

    [Test]
    public async Task SearchAsync_NoFilters_ReturnsAllItems()
    {
        await SeedItemAsync("A", Categories.Books, 10m, 0);
        await SeedItemAsync("B", Categories.ToysAndGames, 10m, 1);

        var results = await _service.SearchAsync(term: null, category: null);

        Assert.That(results, Has.Count.EqualTo(2));
    }

    [Test]
    public async Task ReorderAsync_ReordersItemsWithinTheirOwnSlots()
    {
        var first = await SeedItemAsync("First", Categories.Books, 10m, 0);
        var second = await SeedItemAsync("Second", Categories.Books, 10m, 1);
        var third = await SeedItemAsync("Third", Categories.Books, 10m, 2);

        // Move Third to the front, keep Second in the middle, First last.
        await _service.ReorderAsync(new[] { third.Id, second.Id, first.Id });

        var ordered = await _service.GetAllAsync();

        Assert.That(ordered.Select(i => i.Name), Is.EqualTo(new[] { "Third", "Second", "First" }));
    }

    [Test]
    public async Task ReorderAsync_EmptyList_DoesNothing()
    {
        await SeedItemAsync("Only", Categories.Books, 10m, 0);

        await _service.ReorderAsync(Array.Empty<int>());

        var ordered = await _service.GetAllAsync();
        Assert.That(ordered, Has.Count.EqualTo(1));
    }
}
