using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;

namespace IdentityService.Data;

// Owns AspNetUsers/AspNetRoles only — no Items table here. Splitting off the
// monolith's shared AcmeCatalogDbContext into this service-specific context
// (instead of reusing it) is the actual point of database-per-service: this
// service's schema is free to evolve without touching catalog-service's.
public class IdentityServiceDbContext : IdentityDbContext<IdentityUser>
{
    public IdentityServiceDbContext(DbContextOptions<IdentityServiceDbContext> options) : base(options)
    {
    }
}
