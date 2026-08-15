using Microsoft.AspNetCore.Identity;

namespace AcmeCatalog.Infrastructure.Data;

public static class IdentitySeeder
{
    public const string TestUserName = "testuser";
    public const string TestUserEmail = "testuser@acmecatalog.local";
    public const string TestUserPassword = "Test123!";

    public static async Task SeedAsync(UserManager<IdentityUser> userManager)
    {
        var existing = await userManager.FindByNameAsync(TestUserName);
        if (existing is not null)
        {
            return;
        }

        var user = new IdentityUser
        {
            UserName = TestUserName,
            Email = TestUserEmail,
            EmailConfirmed = true
        };

        await userManager.CreateAsync(user, TestUserPassword);
    }
}
