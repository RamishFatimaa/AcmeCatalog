using System.Text;
using AcmeCatalog.Core.Interfaces;
using AcmeCatalog.Core.Models;
using AcmeCatalog.Web.Storage;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace AcmeCatalog.Web.Controllers.Api;

[ApiController]
[Route("api/items")]
public class ItemsApiController : ControllerBase
{
    private static readonly string[] AllowedImageExtensions = [".jpg", ".jpeg", ".png", ".gif", ".webp"];

    private readonly IItemService _itemService;
    private readonly UploadsPathOptions _uploadsPath;

    public ItemsApiController(IItemService itemService, UploadsPathOptions uploadsPath)
    {
        _itemService = itemService;
        _uploadsPath = uploadsPath;
    }

    // GET api/items?term=&category=&sort=&minPrice=&maxPrice=
    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<Item>>> GetAll(
        [FromQuery] string? term,
        [FromQuery] string? category,
        [FromQuery] string? sort,
        [FromQuery] decimal? minPrice,
        [FromQuery] decimal? maxPrice)
    {
        return Ok(await _itemService.SearchAsync(term, category, sort, minPrice, maxPrice));
    }

    // GET api/items/5
    [HttpGet("{id:int}")]
    public async Task<ActionResult<Item>> GetById(int id)
    {
        var item = await _itemService.GetByIdAsync(id);
        if (item is null)
        {
            return Problem(statusCode: 404, title: "Item not found", detail: $"No item exists with id {id}.");
        }

        return Ok(item);
    }

    // POST api/items
    [HttpPost]
    [Authorize(AuthenticationSchemes = JwtBearerDefaults.AuthenticationScheme)]
    public async Task<ActionResult<Item>> Create([FromBody] Item item)
    {
        if (!ModelState.IsValid)
        {
            return ValidationProblem(ModelState);
        }

        var created = await _itemService.CreateAsync(item);
        return CreatedAtAction(nameof(GetById), new { id = created.Id }, created);
    }

    // PUT api/items/5
    [HttpPut("{id:int}")]
    [Authorize(AuthenticationSchemes = JwtBearerDefaults.AuthenticationScheme)]
    public async Task<IActionResult> Update(int id, [FromBody] Item item)
    {
        if (id != item.Id)
        {
            return Problem(statusCode: 400, title: "Id mismatch", detail: "The route id and request body id must match.");
        }

        if (!ModelState.IsValid)
        {
            return ValidationProblem(ModelState);
        }

        var updated = await _itemService.UpdateAsync(item);
        if (!updated)
        {
            return Problem(statusCode: 404, title: "Item not found", detail: $"No item exists with id {id}.");
        }

        return NoContent();
    }

    // DELETE api/items/5
    [HttpDelete("{id:int}")]
    [Authorize(AuthenticationSchemes = JwtBearerDefaults.AuthenticationScheme)]
    public async Task<IActionResult> Delete(int id)
    {
        var deleted = await _itemService.DeleteAsync(id);
        if (!deleted)
        {
            return Problem(statusCode: 404, title: "Item not found", detail: $"No item exists with id {id}.");
        }

        return NoContent();
    }

    // POST api/items/5/image (multipart/form-data, field name "file")
    // Restores the image-upload feature the original Razor MVC ItemsController
    // had (SaveUploadedImageAsync) but that never got reimplemented when the
    // UI moved to React — ItemForm only ever gained a plain image-URL field.
    // Saves to UploadsPathOptions.Path rather than WebRootPath directly (the
    // old code's approach), since that path is what's overridden in
    // production to a writable directory on Azure App Service.
    [HttpPost("{id:int}/image")]
    [Authorize(AuthenticationSchemes = JwtBearerDefaults.AuthenticationScheme)]
    [RequestSizeLimit(5 * 1024 * 1024)]
    public async Task<ActionResult<Item>> UploadImage(int id, IFormFile file)
    {
        if (file is null || file.Length == 0)
        {
            return Problem(statusCode: 400, title: "No file provided", detail: "Attach an image file under the 'file' form field.");
        }

        var extension = Path.GetExtension(file.FileName).ToLowerInvariant();
        if (!AllowedImageExtensions.Contains(extension))
        {
            return Problem(statusCode: 400, title: "Unsupported file type", detail: "Only JPEG, PNG, GIF, and WebP images are supported.");
        }

        Directory.CreateDirectory(_uploadsPath.Path);
        var fileName = $"{Guid.NewGuid()}{extension}";
        var filePath = Path.Combine(_uploadsPath.Path, fileName);

        await using (var stream = new FileStream(filePath, FileMode.Create))
        {
            await file.CopyToAsync(stream);
        }

        var updated = await _itemService.UpdateImageAsync(id, $"/uploads/{fileName}");
        if (updated is null)
        {
            return Problem(statusCode: 404, title: "Item not found", detail: $"No item exists with id {id}.");
        }

        return Ok(updated);
    }

    // GET api/items/export
    [HttpGet("export")]
    public async Task<IActionResult> Export()
    {
        var items = await _itemService.SearchAsync(term: null, category: null, sort: "name");

        var csv = new StringBuilder();
        csv.AppendLine("Id,Name,Price,Category,Description,DateAdded");
        foreach (var item in items)
        {
            csv.AppendLine(string.Join(",",
                item.Id,
                CsvEscape(item.Name),
                item.Price,
                CsvEscape(item.Category),
                CsvEscape(item.Description),
                item.DateAdded.ToString("O")));
        }

        var bytes = Encoding.UTF8.GetBytes(csv.ToString());
        return File(bytes, "text/csv", "acmecatalog-items.csv");
    }

    private static string CsvEscape(string value)
    {
        if (value.Contains(',') || value.Contains('"') || value.Contains('\n'))
        {
            return $"\"{value.Replace("\"", "\"\"")}\"";
        }

        return value;
    }

    // GET api/items/categories
    [HttpGet("categories")]
    public async Task<ActionResult<IReadOnlyList<string>>> GetCategories()
    {
        return Ok(await _itemService.GetCategoriesAsync());
    }

    // PUT api/items/reorder
    [HttpPut("reorder")]
    [Authorize(AuthenticationSchemes = JwtBearerDefaults.AuthenticationScheme)]
    public async Task<IActionResult> Reorder([FromBody] List<int> orderedIds)
    {
        if (orderedIds is null || orderedIds.Count == 0)
        {
            return Problem(statusCode: 400, title: "Invalid order", detail: "orderedIds must be a non-empty array.");
        }

        await _itemService.ReorderAsync(orderedIds);
        return NoContent();
    }
}
