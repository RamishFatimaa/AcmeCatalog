using AcmeCatalog.Infrastructure.Data;
using Microsoft.AspNetCore.Mvc;

namespace AcmeCatalog.Web.Controllers.Api;

// Backs Cypress's cy.resetDb() so E2E specs start from a known catalog state
// instead of accumulating items across runs. Reuses DbSeeder.Seed() rather
// than duplicating seed data in JS — the .NET equivalent of a cy.task('db:seed').
[ApiController]
[Route("api/test")]
public class TestApiController : ControllerBase
{
    private readonly AcmeCatalogDbContext _db;
    private readonly IWebHostEnvironment _env;

    public TestApiController(AcmeCatalogDbContext db, IWebHostEnvironment env)
    {
        _db = db;
        _env = env;
    }

    [HttpPost("reset")]
    public async Task<IActionResult> Reset()
    {
        // Guarded here too, not just by registration, so it's unreachable
        // even if Production were ever misconfigured.
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
