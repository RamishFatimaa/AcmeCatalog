using AcmeCatalog.Core.Models;

namespace AcmeCatalog.Infrastructure.Data;

public static class DbSeeder
{
    public static void Seed(AcmeCatalogDbContext context)
    {
        context.Database.EnsureCreated();

        if (context.Items.Any())
        {
            return;
        }

        var items = new List<Item>
        {
            new()
            {
                Name = "Wireless Noise-Cancelling Headphones",
                Price = 179.99m,
                Description = "Over-ear Bluetooth headphones with active noise cancellation, 30-hour battery life, and plush memory-foam ear cups for all-day comfort.",
                Category = Categories.Electronics,
                ImageUrl = "https://picsum.photos/seed/acme-headphones/500/375",
                SortOrder = 0
            },
            new()
            {
                Name = "4K Streaming Media Stick",
                Price = 39.99m,
                Description = "Plug-and-play streaming device with 4K HDR support, voice remote, and access to all major streaming apps.",
                Category = Categories.Electronics,
                ImageUrl = "https://picsum.photos/seed/acme-streamstick/500/375",
                SortOrder = 1
            },
            new()
            {
                Name = "Stainless Steel French Press",
                Price = 34.50m,
                Description = "Double-walled insulated French press that keeps coffee hot for hours. Holds 34 oz, dishwasher-safe parts.",
                Category = Categories.HomeAndKitchen,
                ImageUrl = "https://picsum.photos/seed/acme-frenchpress/500/375",
                SortOrder = 2
            },
            new()
            {
                Name = "Non-Stick Ceramic Cookware Set",
                Price = 129.00m,
                Description = "10-piece cookware set with ceramic non-stick coating, oven-safe up to 500F, and shatterproof tempered-glass lids.",
                Category = Categories.HomeAndKitchen,
                ImageUrl = "https://picsum.photos/seed/acme-cookware/500/375",
                SortOrder = 3
            },
            new()
            {
                Name = "Adjustable Dumbbell Set",
                Price = 249.99m,
                Description = "Space-saving adjustable dumbbells, 5 to 52.5 lbs per hand in quick dial-turn increments. Replaces 15 sets of weights.",
                Category = Categories.SportingGoods,
                ImageUrl = "https://picsum.photos/seed/acme-dumbbells/500/375",
                SortOrder = 4
            },
            new()
            {
                Name = "Trail Running Shoes",
                Price = 89.95m,
                Description = "Lightweight trail runners with aggressive lug outsoles, breathable mesh uppers, and rock-plate protection.",
                Category = Categories.SportingGoods,
                ImageUrl = "https://picsum.photos/seed/acme-trailshoes/500/375",
                SortOrder = 5
            },
            new()
            {
                Name = "The Pragmatic Programmer",
                Price = 44.99m,
                Description = "A classic guide to software craftsmanship covering practical techniques for becoming a more effective, adaptable engineer.",
                Category = Categories.Books,
                ImageUrl = "https://picsum.photos/seed/acme-pragprog/500/375",
                SortOrder = 6
            },
            new()
            {
                Name = "Atomic Habits",
                Price = 16.99m,
                Description = "A practical guide to building good habits and breaking bad ones, one small change at a time.",
                Category = Categories.Books,
                ImageUrl = "https://picsum.photos/seed/acme-atomichabits/500/375",
                SortOrder = 7
            },
            new()
            {
                Name = "Wooden Building Block Set",
                Price = 54.00m,
                Description = "150-piece natural wood building block set in a canvas storage bag. Encourages open-ended creative play for ages 3+.",
                Category = Categories.ToysAndGames,
                ImageUrl = "https://picsum.photos/seed/acme-blocks/500/375",
                SortOrder = 8
            },
            new()
            {
                Name = "Strategy Board Game: Trade Routes",
                Price = 42.50m,
                Description = "A 2-5 player strategy board game about building trade networks across a fictional continent. 60-90 minute playtime.",
                Category = Categories.ToysAndGames,
                ImageUrl = "https://picsum.photos/seed/acme-boardgame/500/375",
                SortOrder = 9
            }
        };

        context.Items.AddRange(items);
        context.SaveChanges();
    }
}
