using System.ComponentModel.DataAnnotations;
using AcmeCatalog.Core.Models;

namespace AcmeCatalog.Web.ViewModels;

public class ItemFormViewModel
{
    public int Id { get; set; }

    [Required(ErrorMessage = "Name is required.")]
    [StringLength(100, ErrorMessage = "Name cannot exceed 100 characters.")]
    [Display(Name = "Item Name")]
    public string Name { get; set; } = string.Empty;

    [Required(ErrorMessage = "Price is required.")]
    [Range(0.01, 100000, ErrorMessage = "Price must be a positive number.")]
    [DataType(DataType.Currency)]
    public decimal Price { get; set; }

    [Required(ErrorMessage = "Description is required.")]
    [StringLength(1000, ErrorMessage = "Description cannot exceed 1000 characters.")]
    [DataType(DataType.MultilineText)]
    public string Description { get; set; } = string.Empty;

    [Required(ErrorMessage = "Please choose a category.")]
    [Display(Name = "Category")]
    public string Category { get; set; } = string.Empty;

    [Display(Name = "Image URL")]
    [StringLength(500)]
    public string? ImageUrl { get; set; }

    [Display(Name = "Upload Image")]
    public IFormFile? ImageFile { get; set; }

    public IReadOnlyList<string> CategoryOptions { get; set; } = Categories.All;
}
