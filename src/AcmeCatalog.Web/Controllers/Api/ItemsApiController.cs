using AcmeCatalog.Core.Interfaces;
using AcmeCatalog.Core.Models;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace AcmeCatalog.Web.Controllers.Api;

[ApiController]
[Route("api/items")]
public class ItemsApiController : ControllerBase
{
    private readonly IItemService _itemService;

    public ItemsApiController(IItemService itemService)
    {
        _itemService = itemService;
    }

    // GET api/items?term=&category=
    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<Item>>> GetAll([FromQuery] string? term, [FromQuery] string? category)
    {
        if (!string.IsNullOrWhiteSpace(term) || !string.IsNullOrWhiteSpace(category))
        {
            return Ok(await _itemService.SearchAsync(term, category));
        }

        return Ok(await _itemService.GetAllAsync());
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

    // GET api/items/categories
    [HttpGet("categories")]
    public async Task<ActionResult<IReadOnlyList<string>>> GetCategories()
    {
        return Ok(await _itemService.GetCategoriesAsync());
    }
}
