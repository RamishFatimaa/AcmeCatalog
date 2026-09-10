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
            // SQLite has no native datetime-with-timezone type — every
            // DateAdded is genuinely assigned via DateTime.UtcNow, but EF
            // Core's SQLite provider drops the Kind on round-trip and reads
            // it back as Unspecified, which System.Text.Json then
            // serializes without a trailing "Z". That produced timestamps
            // failing their own documented OpenAPI "date-time" (RFC 3339)
            // format. The value itself never changes; this only restores
            // the Kind that was always true.
            entity.Property(i => i.DateAdded)
                .HasConversion(v => v, v => DateTime.SpecifyKind(v, DateTimeKind.Utc));
        });

        base.OnModelCreating(modelBuilder);
    }
}
