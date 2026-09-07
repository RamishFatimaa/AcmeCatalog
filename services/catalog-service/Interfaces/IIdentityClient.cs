namespace CatalogService.Interfaces;

// The one seam this whole service's inter-service testing surface is built
// on: an interface, not a concrete HttpClient, specifically so unit tests can
// mock it directly (Moq/NSubstitute) without going anywhere near HTTP, while
// IdentityClient itself gets exercised separately against a real (or
// WireMock.Net-stubbed) HTTP endpoint.
public interface IIdentityClient
{
    // Never throws on a partial or total failure — a missing/unresolvable id
    // is simply absent from the result. Callers are the ones who decide what
    // "unknown" should render as.
    Task<IReadOnlyDictionary<string, string>> GetDisplayNamesAsync(IReadOnlyCollection<string> userIds, CancellationToken cancellationToken = default);
}
