using AcmeCatalog.Core.Interfaces;
using AcmeCatalog.Core.Models;
using AcmeCatalog.Web.Storage;
using AcmeCatalog.Web.ViewModels;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace AcmeCatalog.Web.Controllers;

public class ItemsController : Controller
{
    private const int PageSize = 4;

    private readonly IItemService _itemService;
    private readonly UploadsPathOptions _uploadsPath;

    public ItemsController(IItemService itemService, UploadsPathOptions uploadsPath)
    {
        _itemService = itemService;
        _uploadsPath = uploadsPath;
    }

    // GET /Items
    public async Task<IActionResult> Index()
    {
        var allItems = await _itemService.GetAllAsync();
        var categories = await _itemService.GetCategoriesAsync();

        var model = new ItemsIndexViewModel
        {
            Items = allItems.Take(PageSize).ToList(),
            AllCategories = categories,
            TotalCount = allItems.Count,
            PageSize = PageSize,
            HasMore = allItems.Count > PageSize
        };

        return View(model);
    }

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

    // GET /Items/Create
    [Authorize]
    public IActionResult Create()
    {
        return View(new ItemFormViewModel());
    }

    // POST /Items/Create
    [HttpPost]
    [Authorize]
    [ValidateAntiForgeryToken]
    public async Task<IActionResult> Create(ItemFormViewModel form)
    {
        if (!ModelState.IsValid)
        {
            return View(form);
        }

        var imageUrl = await SaveUploadedImageAsync(form.ImageFile) ?? form.ImageUrl;

        var item = new Item
        {
            Name = form.Name,
            Price = form.Price,
            Description = form.Description,
            Category = form.Category,
            ImageUrl = imageUrl
        };

        await _itemService.CreateAsync(item);

        TempData["ToastMessage"] = $"\"{item.Name}\" was added to the catalog.";
        TempData["ToastType"] = "success";
        return RedirectToAction(nameof(Index));
    }

    // GET /Items/Edit/5
    [Authorize]
    public async Task<IActionResult> Edit(int id)
    {
        var item = await _itemService.GetByIdAsync(id);
        if (item is null)
        {
            return NotFound();
        }

        var form = new ItemFormViewModel
        {
            Id = item.Id,
            Name = item.Name,
            Price = item.Price,
            Description = item.Description,
            Category = item.Category,
            ImageUrl = item.ImageUrl
        };

        return View(form);
    }

    // POST /Items/Edit/5
    [HttpPost]
    [Authorize]
    [ValidateAntiForgeryToken]
    public async Task<IActionResult> Edit(int id, ItemFormViewModel form)
    {
        if (id != form.Id)
        {
            return BadRequest();
        }

        if (!ModelState.IsValid)
        {
            return View(form);
        }

        var uploadedUrl = await SaveUploadedImageAsync(form.ImageFile);

        var item = new Item
        {
            Id = form.Id,
            Name = form.Name,
            Price = form.Price,
            Description = form.Description,
            Category = form.Category,
            ImageUrl = uploadedUrl ?? form.ImageUrl
        };

        var updated = await _itemService.UpdateAsync(item);
        if (!updated)
        {
            return NotFound();
        }

        TempData["ToastMessage"] = $"\"{item.Name}\" was updated.";
        TempData["ToastType"] = "success";
        return RedirectToAction(nameof(Index));
    }

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

    private async Task<string?> SaveUploadedImageAsync(IFormFile? file)
    {
        if (file is null || file.Length == 0)
        {
            return null;
        }

        Directory.CreateDirectory(_uploadsPath.Path);

        var safeExtension = Path.GetExtension(file.FileName);
        var fileName = $"{Guid.NewGuid()}{safeExtension}";
        var filePath = Path.Combine(_uploadsPath.Path, fileName);

        await using (var stream = new FileStream(filePath, FileMode.Create))
        {
            await file.CopyToAsync(stream);
        }

        return $"/uploads/{fileName}";
    }
}
