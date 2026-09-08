using IdentityService.Dtos;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;

namespace IdentityService.Controllers;

// The one real service-to-service boundary in this system: catalog-service
// calls this to resolve item creators' display names. Batched by design
// (?ids=a,b,c, one round trip) — this is the shape catalog-service's
// IIdentityClient, its unit tests, its WireMock.Net stub, and the Pact
// contract in Phase 3 all depend on. See UserLookupResponse for the
// production caveat on how this endpoint should actually be secured.
[ApiController]
[Route("internal/users")]
public class InternalUsersController : ControllerBase
{
    private readonly UserManager<IdentityUser> _userManager;

    public InternalUsersController(UserManager<IdentityUser> userManager)
    {
        _userManager = userManager;
    }

    // GET internal/users?ids=guid1,guid2
    [HttpGet]
    public async Task<ActionResult<List<UserLookupResponse>>> GetByIds([FromQuery] string ids)
    {
        if (string.IsNullOrWhiteSpace(ids))
        {
            return Ok(new List<UserLookupResponse>());
        }

        var idList = ids.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

        var results = new List<UserLookupResponse>();
        foreach (var id in idList)
        {
            var user = await _userManager.FindByIdAsync(id);
            if (user is not null)
            {
                results.Add(new UserLookupResponse { Id = user.Id, Username = user.UserName ?? string.Empty });
            }
        }

        // IDs with no matching user are simply omitted, not errored — callers
        // (catalog-service) treat a missing entry the same as a failed lookup:
        // fall back to "Unknown" for that one item rather than failing the batch.
        return Ok(results);
    }
}
