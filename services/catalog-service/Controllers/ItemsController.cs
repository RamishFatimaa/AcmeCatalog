using System.Net;
using CatalogService.Interfaces;
using Microsoft.AspNetCore.Mvc;

namespace CatalogService.Controllers;

// The one non-JSON route in this service: a standalone HTML document (no
// layout, no other assets) meant to be embedded as the React Quick View
// modal's iframe src. Kept at its original MVC-era path (Items/ImagePreview)
// since the frontend still references it directly — Phase 2 rebases that
// reference to catalog-service's real base URL instead of relative pathing.
public class ItemsController : ControllerBase
{
    private readonly IItemService _itemService;

    public ItemsController(IItemService itemService)
    {
        _itemService = itemService;
    }

    // GET Items/ImagePreview/5
    [HttpGet("Items/ImagePreview/{id:int}")]
    public async Task<IActionResult> ImagePreview(int id)
    {
        var item = await _itemService.GetByIdAsync(id);
        if (item is null)
        {
            return NotFound();
        }

        // Item.Name/ImageUrl are user-supplied (via POST api/items) — this
        // response isn't Razor, so nothing HTML-encodes them automatically
        // the way the original @Model.Name view did. Encoding by hand here
        // is what stands between this and a stored XSS via a crafted item
        // name.
        var encodedName = WebUtility.HtmlEncode(item.Name);
        var encodedImageUrl = WebUtility.HtmlEncode(item.ImageUrl ?? string.Empty);

        var html = $$"""
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="utf-8" />
                <title>{{encodedName}} - Image Preview</title>
                <style>
                    body { margin: 0; display: flex; align-items: center; justify-content: center; min-height: 100vh; background: #f8f9fa; font-family: -apple-system, Segoe UI, Roboto, Arial, sans-serif; }
                    img { max-width: 100%; max-height: 100vh; object-fit: contain; }
                </style>
            </head>
            <body>
                <img src="{{encodedImageUrl}}" alt="{{encodedName}}" id="preview-image" />
            </body>
            </html>
            """;

        return Content(html, "text/html");
    }
}
