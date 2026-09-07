using System.ComponentModel.DataAnnotations;

namespace AcmeCatalog.Web.Dtos;

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
