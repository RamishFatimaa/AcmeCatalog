using AcmeCatalog.Core.Models;

namespace AcmeCatalog.Web.ViewModels;

public class ItemsIndexViewModel
{
    public IReadOnlyList<Item> Items { get; set; } = Array.Empty<Item>();

    public IReadOnlyList<string> AllCategories { get; set; } = Array.Empty<string>();

    public int TotalCount { get; set; }

    public int PageSize { get; set; }

    public bool HasMore { get; set; }
}
