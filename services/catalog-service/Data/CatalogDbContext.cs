using CatalogService.Models;
using Microsoft.EntityFrameworkCore;

namespace CatalogService.Data;

// A plain DbContext, not IdentityDbContext — this service owns no user data
// at all, on purpose. CreatedByUserId on Item is stored as a bare string,
// never a foreign key into anything, because there's nothing in this
// database for it to reference.
public class CatalogDbContext : DbContext
{
    public CatalogDbContext(DbContextOptions<CatalogDbContext> options) : base(options)
    {
    }

    public DbSet<Item> Items => Set<Item>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Item>(entity =>
        {
            entity.Property(i => i.Price).HasPrecision(18, 2);
            entity.Property(i => i.Name).IsRequired();
            entity.Property(i => i.Category).IsRequired();
        });

        base.OnModelCreating(modelBuilder);
    }
}
