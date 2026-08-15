using AcmeCatalog.Core.Models;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;

namespace AcmeCatalog.Infrastructure.Data;

public class AcmeCatalogDbContext : IdentityDbContext<IdentityUser>
{
    public AcmeCatalogDbContext(DbContextOptions<AcmeCatalogDbContext> options) : base(options)
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
