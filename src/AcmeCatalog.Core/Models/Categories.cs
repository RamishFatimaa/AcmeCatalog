namespace AcmeCatalog.Core.Models;

public static class Categories
{
    public const string Electronics = "Electronics";
    public const string HomeAndKitchen = "Home & Kitchen";
    public const string SportingGoods = "Sporting Goods";
    public const string Books = "Books";
    public const string ToysAndGames = "Toys & Games";

    public static readonly IReadOnlyList<string> All = new[]
    {
        Electronics, HomeAndKitchen, SportingGoods, Books, ToysAndGames
    };
}
