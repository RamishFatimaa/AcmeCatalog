using System.ComponentModel.DataAnnotations;

namespace IdentityService.Dtos;

public class LoginRequest
{
    [Required]
    public string Username { get; set; } = string.Empty;

    [Required]
    public string Password { get; set; } = string.Empty;
}

public class LoginResponse
{
    public string Token { get; set; } = string.Empty;

    public DateTime ExpiresAtUtc { get; set; }

    public string Username { get; set; } = string.Empty;
}

public class RegisterRequest
{
    [Required(ErrorMessage = "Username is required.")]
    [StringLength(50, MinimumLength = 3, ErrorMessage = "Username must be between 3 and 50 characters.")]
    public string Username { get; set; } = string.Empty;

    [Required(ErrorMessage = "Email is required.")]
    [EmailAddress(ErrorMessage = "Enter a valid email address.")]
    public string Email { get; set; } = string.Empty;

    [Required(ErrorMessage = "Password is required.")]
    [StringLength(100, MinimumLength = 6, ErrorMessage = "Password must be at least 6 characters.")]
    public string Password { get; set; } = string.Empty;

    [Required(ErrorMessage = "Please confirm your password.")]
    [Compare(nameof(Password), ErrorMessage = "Passwords do not match.")]
    public string ConfirmPassword { get; set; } = string.Empty;
}

public class UserResponse
{
    public string Username { get; set; } = string.Empty;

    public string Email { get; set; } = string.Empty;
}

// Internal, service-to-service response shape — this is the actual contract
// catalog-service depends on (see /internal/users). A real deployment would
// restrict this endpoint at the network layer (internal-only ingress) or
// behind a service-to-service credential, neither of which is set up in this
// pass — noted rather than pretended away.
public class UserLookupResponse
{
    public string Id { get; set; } = string.Empty;

    public string Username { get; set; } = string.Empty;
}
