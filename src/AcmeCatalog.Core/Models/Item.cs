using System.ComponentModel.DataAnnotations;

namespace AcmeCatalog.Core.Models;

public class Item
{
    public int Id { get; set; }

    [Required(ErrorMessage = "Name is required.")]
    [StringLength(100, ErrorMessage = "Name cannot exceed 100 characters.")]
    public string Name { get; set; } = string.Empty;

    [Required(ErrorMessage = "Price is required.")]
    [Range(0.01, 100000, ErrorMessage = "Price must be a positive number.")]
    public decimal Price { get; set; }

    [Required(ErrorMessage = "Description is required.")]
    [StringLength(1000, ErrorMessage = "Description cannot exceed 1000 characters.")]
    public string Description { get; set; } = string.Empty;

    [Required(ErrorMessage = "Category is required.")]
    public string Category { get; set; } = string.Empty;

    public string? ImageUrl { get; set; }

    public int SortOrder { get; set; }

    public DateTime DateAdded { get; set; } = DateTime.UtcNow;
}
