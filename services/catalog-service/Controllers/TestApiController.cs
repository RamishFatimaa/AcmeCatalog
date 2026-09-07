using CatalogService.Data;
using Microsoft.AspNetCore.Mvc;

namespace CatalogService.Controllers;

// Backs Cypress's cy.resetDb() so E2E specs start from a known catalog state
// instead of accumulating items across runs.
[ApiController]
[Route("api/test")]
public class TestApiController : ControllerBase
{
    private readonly CatalogDbContext _db;
    private readonly IWebHostEnvironment _env;

    public TestApiController(CatalogDbContext db, IWebHostEnvironment env)
    {
        _db = db;
        _env = env;
    }

    [HttpPost("reset")]
    public async Task<IActionResult> Reset()
    {
        if (!_env.IsDevelopment())
        {
            return NotFound();
        }

        _db.Items.RemoveRange(_db.Items);
        await _db.SaveChangesAsync();
        DbSeeder.Seed(_db);

        return Ok();
    }
}
