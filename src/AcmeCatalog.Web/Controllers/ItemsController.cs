using AcmeCatalog.Core.Interfaces;
using Microsoft.AspNetCore.Mvc;

namespace AcmeCatalog.Web.Controllers;

// Everything else the catalog needs — browsing, search, create, edit, delete,
// reorder — is React (clientapp/) talking to /api/items and /api/auth.
// ImagePreview is the one Razor route still actually in use: it's the iframe
// src in the React Quick View modal, a standalone same-origin document.
public class ItemsController : Controller
{
    private readonly IItemService _itemService;

    public ItemsController(IItemService itemService)
    {
        _itemService = itemService;
    }

    // GET /Items/ImagePreview/5
    public async Task<IActionResult> ImagePreview(int id)
    {
        var item = await _itemService.GetByIdAsync(id);
        if (item is null)
        {
            return NotFound();
        }

        return View(item);
    }
}
