using AcmeCatalog.Core.Models;

namespace AcmeCatalog.Web.Helpers;

public static class CategoryStyleHelper
{
    public static string GetBadgeClass(string category) => category switch
    {
        Categories.Electronics => "cat-badge cat-electronics",
        Categories.HomeAndKitchen => "cat-badge cat-home",
        Categories.SportingGoods => "cat-badge cat-sporting",
        Categories.Books => "cat-badge cat-books",
        Categories.ToysAndGames => "cat-badge cat-toys",
        _ => "cat-badge"
    };
}
