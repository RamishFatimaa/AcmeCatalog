using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using AcmeCatalog.Web.Dtos;
using AcmeCatalog.Web.Security;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
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

    // POST api/auth/register
    [HttpPost("register")]
    public async Task<ActionResult<LoginResponse>> Register([FromBody] RegisterRequest request)
    {
        if (!ModelState.IsValid)
        {
            return ValidationProblem(ModelState);
        }

        var user = new IdentityUser { UserName = request.Username, Email = request.Email };
        var result = await _userManager.CreateAsync(user, request.Password);

        if (!result.Succeeded)
        {
            foreach (var error in result.Errors)
            {
                ModelState.AddModelError(string.Empty, error.Description);
            }

            return ValidationProblem(ModelState);
        }

        // JWT auth is stateless, so "signing in" after registration just means
        // issuing a token immediately — there's no session to establish.
        var (token, expiresAtUtc) = _tokenService.GenerateToken(user);

        return Ok(new LoginResponse
        {
            Token = token,
            ExpiresAtUtc = expiresAtUtc,
            Username = user.UserName ?? request.Username
        });
    }

    // GET api/auth/me
    [HttpGet("me")]
    [Authorize(AuthenticationSchemes = JwtBearerDefaults.AuthenticationScheme)]
    public ActionResult<UserResponse> Me()
    {
        // Read straight from the validated token's claims — the same ones
        // JwtTokenService issues — rather than a redundant database lookup.
        var username = User.FindFirstValue(JwtRegisteredClaimNames.UniqueName);
        var email = User.FindFirstValue(JwtRegisteredClaimNames.Email);

        return Ok(new UserResponse
        {
            Username = username ?? string.Empty,
            Email = email ?? string.Empty
        });
    }
}
