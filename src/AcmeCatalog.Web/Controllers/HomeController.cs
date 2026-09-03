using System.Diagnostics;
using AcmeCatalog.Web.Models;
using Microsoft.AspNetCore.Mvc;

namespace AcmeCatalog.Web.Controllers;

// Index() and Help() moved to the React app (clientapp/) — see
// Program.cs's MapFallbackToFile. Privacy and Error stay server-rendered:
// Error in particular is infrastructure (UseExceptionHandler's target),
// not a content page migrated for its own sake.
public class HomeController : Controller
{
    public IActionResult Privacy()
    {
        return View();
    }

    [ResponseCache(Duration = 0, Location = ResponseCacheLocation.None, NoStore = true)]
    public IActionResult Error()
    {
        return View(new ErrorViewModel { RequestId = Activity.Current?.Id ?? HttpContext.TraceIdentifier });
    }
}
