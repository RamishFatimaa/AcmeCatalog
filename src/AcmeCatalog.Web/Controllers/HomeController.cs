using System.Diagnostics;
using AcmeCatalog.Core.Interfaces;
using AcmeCatalog.Web.Models;
using AcmeCatalog.Web.ViewModels;
using Microsoft.AspNetCore.Mvc;

namespace AcmeCatalog.Web.Controllers;

public class HomeController : Controller
{
    private readonly IItemService _itemService;

    public HomeController(IItemService itemService)
    {
        _itemService = itemService;
    }

    public async Task<IActionResult> Index()
    {
        var items = await _itemService.GetAllAsync();
        var categories = await _itemService.GetCategoriesAsync();

        var model = new HomeIndexViewModel
        {
            ItemCount = items.Count,
            CategoryCount = categories.Count,
            LatestItemName = items.OrderByDescending(i => i.DateAdded).FirstOrDefault()?.Name
        };

        return View(model);
    }

    public IActionResult Help()
    {
        return View();
    }

    public IActionResult Privacy()
    {
        return View();
    }

    [ResponseCache(Duration = 0, Location = ResponseCacheLocation.None, NoStore = true)]
    public IActionResult Error()
    {
        return View(new ErrorViewModel { RequestId = Activity.Current?.Id ?? HttpContext.TraceIdentifier });
    }
}
