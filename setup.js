// setup.js
document.getElementById('btnPermission').onclick = async () =>
{
    try
    {
        await navigator.mediaDevices.getUserMedia({ audio: true });
        alert("Success! You can now use the popup recorder.");
        window.close(); // Close this tab
    } catch (error)
    {
        alert("Error: " + error.message + ". Please try again and click 'Allow'.");
    }
};