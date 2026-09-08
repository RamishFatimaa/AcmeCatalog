using CatalogService.Interfaces;
using CatalogService.Models;
using CatalogService.Services;
using Moq;

namespace CatalogService.Tests;

// Real object under test: ItemEnricher. Mocked: IIdentityClient — the one
// actual external dependency, per the classical (state-verification) style
// this codebase settled on for its Cypress suite this session, now applied
// to a backend seam for the first time.
[TestFixture]
public class ItemEnricherTests
{
    private Mock<IIdentityClient> _identityClient = null!;
    private ItemEnricher _enricher = null!;

    [SetUp]
    public void SetUp()
    {
        _identityClient = new Mock<IIdentityClient>();
        _enricher = new ItemEnricher(_identityClient.Object);
    }

    [Test]
    public async Task EnrichAsync_ResolvedUser_SetsDisplayName()
    {
        var item = new Item { Id = 1, Name = "Widget", CreatedByUserId = "user-1" };
        _identityClient
            .Setup(c => c.GetDisplayNamesAsync(It.IsAny<IReadOnlyCollection<string>>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new Dictionary<string, string> { ["user-1"] = "alice" });

        var result = await _enricher.EnrichAsync(item);

        Assert.That(result.CreatedByDisplayName, Is.EqualTo("alice"));
    }

    [Test]
    public async Task EnrichAsync_NullCreatedByUserId_ShowsUnknownWithoutCallingIdentityClient()
    {
        // Items seeded before this feature existed have no creator at all —
        // this isn't a failure case, it's a legitimate absent value, and it
        // shouldn't cost a network call to resolve to "Unknown".
        var item = new Item { Id = 1, Name = "Old Widget", CreatedByUserId = null };

        var result = await _enricher.EnrichAsync(item);

        Assert.That(result.CreatedByDisplayName, Is.EqualTo("Unknown"));
        _identityClient.Verify(c => c.GetDisplayNamesAsync(It.IsAny<IReadOnlyCollection<string>>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Test]
    public async Task EnrichAsync_IdentityClientReturnsNoMatch_ShowsUnknown()
    {
        // IIdentityClient's own contract is "never throws, omit unresolvable
        // ids" — this proves the enricher honors that rather than assuming
        // every requested id comes back.
        var item = new Item { Id = 1, Name = "Widget", CreatedByUserId = "user-1" };
        _identityClient
            .Setup(c => c.GetDisplayNamesAsync(It.IsAny<IReadOnlyCollection<string>>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new Dictionary<string, string>());

        var result = await _enricher.EnrichAsync(item);

        Assert.That(result.CreatedByDisplayName, Is.EqualTo("Unknown"));
    }

    [Test]
    public async Task EnrichAsync_MultipleItemsSharingACreator_BatchesIntoOneCall()
    {
        // The actual behavior worth spying on: N items from the same
        // creator must not turn into N calls to identity-service.
        var items = new List<Item>
        {
            new() { Id = 1, Name = "A", CreatedByUserId = "user-1" },
            new() { Id = 2, Name = "B", CreatedByUserId = "user-1" },
            new() { Id = 3, Name = "C", CreatedByUserId = "user-2" }
        };
        _identityClient
            .Setup(c => c.GetDisplayNamesAsync(It.IsAny<IReadOnlyCollection<string>>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new Dictionary<string, string> { ["user-1"] = "alice", ["user-2"] = "bob" });

        var results = await _enricher.EnrichAsync(items);

        Assert.That(results.Select(r => r.CreatedByDisplayName), Is.EqualTo(new[] { "alice", "alice", "bob" }));
        _identityClient.Verify(
            c => c.GetDisplayNamesAsync(
                It.Is<IReadOnlyCollection<string>>(ids => ids.Count == 2 && ids.Contains("user-1") && ids.Contains("user-2")),
                It.IsAny<CancellationToken>()),
            Times.Once);
    }
}
