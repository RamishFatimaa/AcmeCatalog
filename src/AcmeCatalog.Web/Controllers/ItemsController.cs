using AcmeCatalog.Core.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace AcmeCatalog.Web.Controllers;

public class ItemsController : Controller
{
    private const int PageSize = 4;

    private readonly IItemService _itemService;

    public ItemsController(IItemService itemService)
    {
        _itemService = itemService;
    }

    // Index() moved to the React app (clientapp/) — see Program.cs's
    // MapFallbackToFile. LoadMore/Filter/QuickView/Create/Edit/Delete/Reorder
    // below are no longer linked from the UI either (superseded by /api/items
    // and /api/items/reorder), but are left as-is for now — cleaning those up
    // is a separate pass. ImagePreview stays: it's still used directly, as
    // the iframe src in the React Quick View modal.

    // GET /Items/LoadMore?skip=4
    public async Task<IActionResult> LoadMore(int skip = 0)
    {
        var allItems = await _itemService.GetAllAsync();
        var nextBatch = allItems.Skip(skip).Take(PageSize).ToList();
        var hasMore = skip + nextBatch.Count < allItems.Count;

        Response.Headers.Append("X-Has-More", hasMore ? "true" : "false");
        return PartialView("_ItemCardsPartial", nextBatch);
    }

    // GET /Items/Filter?term=&category=
    public async Task<IActionResult> Filter(string? term, string? category)
    {
        var results = await _itemService.SearchAsync(term, category);
        Response.Headers.Append("X-Has-More", "false");
        Response.Headers.Append("X-Result-Count", results.Count.ToString());
        return PartialView("_ItemCardsPartial", results);
    }

    // GET /Items/QuickView/5
    public async Task<IActionResult> QuickView(int id)
    {
        var item = await _itemService.GetByIdAsync(id);
        if (item is null)
        {
            return NotFound();
        }

        return PartialView("_QuickViewPartial", item);
    }

    // GET /Items/ImagePreview/5 - standalone document, embedded via iframe in the Quick View modal
    public async Task<IActionResult> ImagePreview(int id)
    {
        var item = await _itemService.GetByIdAsync(id);
        if (item is null)
        {
            return NotFound();
        }

        return View(item);
    }

    // GET /Items/Details/5
    public async Task<IActionResult> Details(int id)
    {
        var item = await _itemService.GetByIdAsync(id);
        if (item is null)
        {
            return NotFound();
        }

        return View(item);
    }

    // Create() and Edit() (GET+POST) were removed here, not just left as
    // dead code like the others above: their routes (/Items/Create,
    // /Items/Edit/{id}) are exact matches for the new React Router routes,
    // and conventional MVC routing would keep claiming them first, silently
    // shadowing React entirely. Confirmed as a real bug by actually hitting
    // both URLs — JWT-authenticated users got redirected to /Account/Login
    // because the old [Authorize] here checks cookie auth, which no page
    // establishes anymore.

    // POST /Items/Delete/5
    [HttpPost]
    [Authorize]
    [ValidateAntiForgeryToken]
    public async Task<IActionResult> Delete(int id)
    {
        var item = await _itemService.GetByIdAsync(id);
        var deleted = await _itemService.DeleteAsync(id);

        if (deleted)
        {
            TempData["ToastMessage"] = $"\"{item?.Name}\" was deleted.";
            TempData["ToastType"] = "danger";
        }

        return RedirectToAction(nameof(Index));
    }

    // POST /Items/Reorder
    [HttpPost]
    [Authorize]
    [ValidateAntiForgeryToken]
    public async Task<IActionResult> Reorder([FromBody] List<int> orderedIds)
    {
        if (orderedIds is null || orderedIds.Count == 0)
        {
            return BadRequest();
        }

        await _itemService.ReorderAsync(orderedIds);
        return Ok(new { success = true });
    }
}
