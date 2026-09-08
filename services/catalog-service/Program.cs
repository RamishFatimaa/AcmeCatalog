using System.Text;
using CatalogService.Data;
using CatalogService.Interfaces;
using CatalogService.Security;
using CatalogService.Services;
using CatalogService.Storage;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Diagnostics.HealthChecks;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.FileProviders;
using Microsoft.IdentityModel.Tokens;
using Microsoft.OpenApi;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllers();

var connectionString = builder.Configuration.GetConnectionString("DefaultConnection")
    ?? "Data Source=catalog.db";

builder.Services.AddDbContext<CatalogDbContext>(options =>
    options.UseSqlite(connectionString));

builder.Services.AddScoped<IItemService, ItemService>();
builder.Services.AddScoped<ItemEnricher>();

// identity-service is the one real dependency this service has on another
// service — see IIdentityClient's own doc comment for why the resilience
// policy below (not just a try/catch) is the point of the exercise.
var identityServiceBaseUrl = builder.Configuration["Services:IdentityServiceBaseUrl"]
    ?? "http://localhost:5301";

// Order matters inside the pipeline itself (see the extension method):
// timeout innermost bounds a single attempt, retry around that gives a
// slow-but-recovering call one more try, circuit breaker outermost stops
// even attempting once identity-service is clearly unhealthy.
builder.Services.AddIdentityServiceClient(identityServiceBaseUrl);

// Where uploaded item images are saved.
var uploadsPath = builder.Configuration["Storage:UploadsPath"]
    ?? Path.Combine(builder.Environment.WebRootPath ?? Path.Combine(AppContext.BaseDirectory, "wwwroot"), "uploads");
Directory.CreateDirectory(uploadsPath);
builder.Services.AddSingleton(new UploadsPathOptions(uploadsPath));

// Validates JWTs issued by identity-service using the same shared signing
// key from config — no HTTP call to identity-service happens for this, ever.
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
            },
            OnForbidden = async context =>
            {
                context.Response.StatusCode = StatusCodes.Status403Forbidden;
                context.Response.ContentType = "application/problem+json";
                await context.Response.WriteAsJsonAsync(new ProblemDetails
                {
                    Type = "https://tools.ietf.org/html/rfc9110#section-15.5.4",
                    Title = "Forbidden",
                    Status = StatusCodes.Status403Forbidden,
                    Detail = "You do not have permission to access this resource."
                });
            }
        };
    });

builder.Services.AddProblemDetails();

// The frontend is a genuinely separate origin now, not something this
// service serves — Authorization is a bearer header, not a cookie, so no
// credentials mode/Access-Control-Allow-Credentials complexity is needed.
var allowedOrigins = builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>()
    ?? ["http://localhost:5173"];

builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy => policy.WithOrigins(allowedOrigins).AllowAnyHeader().AllowAnyMethod());
});

builder.Services.AddHealthChecks()
    .AddDbContextCheck<CatalogDbContext>("database");

builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(options =>
{
    options.SwaggerDoc("v1", new OpenApiInfo
    {
        Title = "AcmeCatalog Catalog Service",
        Version = "v1",
        Description = "Owns items, categories, image upload, and CSV export. " +
                      "Writes require a JWT bearer token issued by the identity service."
    });

    options.AddSecurityDefinition("Bearer", new OpenApiSecurityScheme
    {
        Name = "Authorization",
        Type = SecuritySchemeType.Http,
        Scheme = "bearer",
        BearerFormat = "JWT",
        In = ParameterLocation.Header,
        Description = "Enter the JWT token returned by identity-service's POST /api/auth/login."
    });

    options.OperationFilter<AuthorizeCheckOperationFilter>();
});

var app = builder.Build();

using (var scope = app.Services.CreateScope())
{
    var context = scope.ServiceProvider.GetRequiredService<CatalogDbContext>();
    DbSeeder.Seed(context);
}

if (!app.Environment.IsDevelopment())
{
    app.UseExceptionHandler();
    app.UseHsts();
}

app.UseSwagger();
app.UseSwaggerUI(options =>
{
    options.SwaggerEndpoint("/swagger/v1/swagger.json", "AcmeCatalog Catalog Service v1");
});

app.UseHttpsRedirection();

app.UseCors();

app.UseStaticFiles(new StaticFileOptions
{
    FileProvider = new PhysicalFileProvider(uploadsPath),
    RequestPath = "/uploads"
});

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
