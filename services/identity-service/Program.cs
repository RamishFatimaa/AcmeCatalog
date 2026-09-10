using System.Text;
using IdentityService.Data;
using IdentityService.Security;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Diagnostics.HealthChecks;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Microsoft.OpenApi;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllers();

var connectionString = builder.Configuration.GetConnectionString("DefaultConnection")
    ?? "Data Source=identity.db";

builder.Services.AddDbContext<IdentityServiceDbContext>(options =>
    options.UseSqlite(connectionString));

builder.Services.AddIdentity<IdentityUser, IdentityRole>(options =>
{
    options.Password.RequiredLength = 6;
    options.Password.RequireNonAlphanumeric = true;
    options.Password.RequireUppercase = true;
    options.Password.RequireLowercase = true;
    options.Password.RequireDigit = true;
    options.User.RequireUniqueEmail = true;
})
    .AddEntityFrameworkStores<IdentityServiceDbContext>()
    .AddDefaultTokenProviders();

// JwtSecurityTokenHandler remaps short inbound claim types (unique_name,
// email, sub) to long XML-schema URIs by default, so User.FindFirstValue
// with the original short names (as AuthApiController's Me() endpoint uses)
// silently returns null. Disabling that keeps claims exactly as issued.
System.IdentityModel.Tokens.Jwt.JwtSecurityTokenHandler.DefaultMapInboundClaims = false;

var jwtKey = builder.Configuration["Jwt:Key"]!;
var jwtIssuer = builder.Configuration["Jwt:Issuer"];
var jwtAudience = builder.Configuration["Jwt:Audience"];

builder.Services.AddAuthentication()
    .AddJwtBearer(JwtBearerDefaults.AuthenticationScheme, options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            ValidIssuer = jwtIssuer,
            ValidAudience = jwtAudience,
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtKey))
        };

        options.Events = new JwtBearerEvents
        {
            OnChallenge = async context =>
            {
                context.HandleResponse();
                context.Response.StatusCode = StatusCodes.Status401Unauthorized;
                context.Response.ContentType = "application/problem+json";
                await context.Response.WriteAsJsonAsync(new ProblemDetails
                {
                    Type = "https://tools.ietf.org/html/rfc9110#section-15.5.2",
                    Title = "Unauthorized",
                    Status = StatusCodes.Status401Unauthorized,
                    Detail = "A valid JWT bearer token is required for this endpoint."
                });
            }
        };
    });

builder.Services.AddScoped<JwtTokenService>();
builder.Services.AddProblemDetails();

var allowedOrigins = builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>()
    ?? ["http://localhost:5173"];

builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy => policy.WithOrigins(allowedOrigins).AllowAnyHeader().AllowAnyMethod());
});

builder.Services.AddHealthChecks()
    .AddDbContextCheck<IdentityServiceDbContext>("database");

builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(options =>
{
    options.SwaggerDoc("v1", new OpenApiInfo
    {
        Title = "AcmeCatalog Identity Service",
        Version = "v1",
        Description = "Owns user accounts and JWT issuance for AcmeCatalog. " +
                      "GET /internal/users is the one endpoint other services call directly."
    });

    options.AddSecurityDefinition("Bearer", new OpenApiSecurityScheme
    {
        Name = "Authorization",
        Type = SecuritySchemeType.Http,
        Scheme = "bearer",
        BearerFormat = "JWT",
        In = ParameterLocation.Header,
        Description = "Enter the JWT token returned by POST /api/auth/login."
    });

    options.OperationFilter<AuthorizeCheckOperationFilter>();
    // Without this, Swashbuckle marks every reference-type property
    // (any plain `string`, nullable or not) as "nullable": true in the
    // generated schema, since it can't otherwise see this project's own
    // <Nullable>enable</Nullable> annotations — the published contract
    // would be looser than what the code actually guarantees.
    options.SupportNonNullableReferenceTypes();
});

var app = builder.Build();

using (var scope = app.Services.CreateScope())
{
    var context = scope.ServiceProvider.GetRequiredService<IdentityServiceDbContext>();
    context.Database.EnsureCreated();

    var userManager = scope.ServiceProvider.GetRequiredService<UserManager<IdentityUser>>();
    await IdentitySeeder.SeedAsync(userManager);
}

if (!app.Environment.IsDevelopment())
{
    app.UseExceptionHandler();
    app.UseHsts();
}

app.UseSwagger();
app.UseSwaggerUI(options =>
{
    options.SwaggerEndpoint("/swagger/v1/swagger.json", "AcmeCatalog Identity Service v1");
});

app.UseHttpsRedirection();

app.UseCors();

app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();

app.MapHealthChecks("/health", new HealthCheckOptions
{
    ResponseWriter = async (context, report) =>
    {
        context.Response.ContentType = "application/json";
        await context.Response.WriteAsync(System.Text.Json.JsonSerializer.Serialize(new
        {
            status = report.Status.ToString(),
            timestampUtc = DateTime.UtcNow
        }));
    }
}).AllowAnonymous();

app.Run();

// Exposed for WebApplicationFactory-based integration tests (Phase 1 test project).
public partial class Program { }
