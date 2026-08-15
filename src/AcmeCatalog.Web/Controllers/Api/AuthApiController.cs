using AcmeCatalog.Web.Dtos;
using AcmeCatalog.Web.Security;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;

namespace AcmeCatalog.Web.Controllers.Api;

[ApiController]
[Route("api/auth")]
public class AuthApiController : ControllerBase
{
    private readonly UserManager<IdentityUser> _userManager;
    private readonly SignInManager<IdentityUser> _signInManager;
    private readonly JwtTokenService _tokenService;

    public AuthApiController(UserManager<IdentityUser> userManager, SignInManager<IdentityUser> signInManager, JwtTokenService tokenService)
    {
        _userManager = userManager;
        _signInManager = signInManager;
        _tokenService = tokenService;
    }

    // POST api/auth/login
    [HttpPost("login")]
    public async Task<ActionResult<LoginResponse>> Login([FromBody] LoginRequest request)
    {
        if (!ModelState.IsValid)
        {
            return ValidationProblem(ModelState);
        }

        var user = await _userManager.FindByNameAsync(request.Username);
        if (user is null)
        {
            return Problem(statusCode: 401, title: "Invalid credentials", detail: "Username or password is incorrect.");
        }

        var result = await _signInManager.CheckPasswordSignInAsync(user, request.Password, lockoutOnFailure: false);
        if (!result.Succeeded)
        {
            return Problem(statusCode: 401, title: "Invalid credentials", detail: "Username or password is incorrect.");
        }

        var (token, expiresAtUtc) = _tokenService.GenerateToken(user);

        return Ok(new LoginResponse
        {
            Token = token,
            ExpiresAtUtc = expiresAtUtc,
            Username = user.UserName ?? request.Username
        });
    }
}
