package com.aravind.hourly

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.app.DownloadManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.content.res.ColorStateList
import android.graphics.Color
import android.graphics.Typeface
import android.net.Uri
import android.net.http.SslError
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.webkit.CookieManager
import android.webkit.DownloadListener
import android.webkit.SslErrorHandler
import android.webkit.URLUtil
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.TextView
import android.widget.Toast
import java.util.Locale

class MainActivity : Activity() {
    private lateinit var webView: WebView
    private lateinit var loadingPanel: FrameLayout
    private lateinit var errorPanel: FrameLayout
    private lateinit var progressBar: ProgressBar
    private var hasLoadedPage = false
    private var mainFrameFailed = false
    private var lastSuccessfulUrl: String? = null
    private var fileChooserCallback: ValueCallback<Array<Uri>>? = null
    private var pendingDownload: PendingDownload? = null
    private val downloadNames = mutableMapOf<Long, String>()
    private var receiverRegistered = false

    private val downloadReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            if (intent.action != DownloadManager.ACTION_DOWNLOAD_COMPLETE) return
            val id = intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1L)
            val name = downloadNames.remove(id) ?: return
            val manager = getSystemService(DOWNLOAD_SERVICE) as DownloadManager
            manager.query(DownloadManager.Query().setFilterById(id))?.use { cursor ->
                if (cursor.moveToFirst()) {
                    val statusColumn = cursor.getColumnIndex(DownloadManager.COLUMN_STATUS)
                    val status = if (statusColumn >= 0) cursor.getInt(statusColumn) else DownloadManager.STATUS_FAILED
                    val message = if (status == DownloadManager.STATUS_SUCCESSFUL) {
                        "Saved to Downloads/$name"
                    } else {
                        "Download failed. Please retry."
                    }
                    Toast.makeText(this@MainActivity, message, Toast.LENGTH_LONG).show()
                }
            }
        }
    }

    private data class PendingDownload(
        val url: String,
        val userAgent: String?,
        val mimeType: String?,
        val fileName: String,
    )

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        configureSystemBars()
        buildLayout()

        val cookieManager = CookieManager.getInstance()
        cookieManager.setAcceptCookie(true)

        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            cacheMode = WebSettings.LOAD_DEFAULT
            mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
            allowFileAccess = false
            allowContentAccess = true
            setSupportMultipleWindows(false)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                safeBrowsingEnabled = true
            }
        }
        cookieManager.setAcceptThirdPartyCookies(webView, true)
        webView.webViewClient = createWebViewClient()
        webView.webChromeClient = createWebChromeClient()
        webView.setDownloadListener(DownloadListener { url, userAgent, contentDisposition, mimeType, _ ->
            startOrRequestDownload(url, userAgent, contentDisposition, mimeType)
        })
        registerDownloadReceiver()

        val restored = savedInstanceState != null && webView.restoreState(savedInstanceState) != null
        if (!restored) webView.loadUrl(START_URL)
    }

    private fun configureSystemBars() {
        window.statusBarColor = Color.rgb(246, 248, 247)
        window.navigationBarColor = Color.rgb(246, 248, 247)
        window.addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS)
        window.decorView.systemUiVisibility =
            View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR or View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR
    }

    private fun buildLayout() {
        val root = FrameLayout(this).apply {
            setBackgroundColor(BACKGROUND)
        }

        webView = WebView(this).apply {
            setBackgroundColor(Color.WHITE)
            layoutParams = FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT,
            )
        }
        root.addView(webView)

        progressBar = ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal).apply {
            max = 100
            progressTintList = ColorStateList.valueOf(MINT)
            progressBackgroundTintList = ColorStateList.valueOf(Color.TRANSPARENT)
            visibility = View.GONE
        }
        root.addView(progressBar, FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            dp(3),
            Gravity.TOP,
        ))

        loadingPanel = createMessagePanel(showLoading = true)
        errorPanel = createMessagePanel(showLoading = false)
        errorPanel.visibility = View.GONE
        root.addView(loadingPanel, FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT,
        ))
        root.addView(errorPanel, FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT,
        ))

        if (Build.VERSION.SDK_INT >= 35) {
            root.setOnApplyWindowInsetsListener { view, insets ->
                val bars = insets.getInsets(android.view.WindowInsets.Type.systemBars())
                view.setPadding(0, bars.top, 0, bars.bottom)
                insets
            }
        }
        setContentView(root)
        if (Build.VERSION.SDK_INT >= 35) root.requestApplyInsets()
    }

    private fun createMessagePanel(showLoading: Boolean): FrameLayout {
        val panel = FrameLayout(this).apply {
            setBackgroundColor(BACKGROUND)
            isClickable = true
            isFocusable = true
        }
        val content = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setPadding(dp(28), dp(24), dp(28), dp(24))
        }

        val logo = ImageView(this).apply {
            setImageResource(R.drawable.ic_hourly_mark)
            contentDescription = getString(R.string.app_name)
        }
        content.addView(logo, LinearLayout.LayoutParams(dp(64), dp(64)).apply {
            bottomMargin = dp(18)
        })

        val title = TextView(this).apply {
            text = if (showLoading) "Hourly" else "Can't reach Hourly"
            textSize = 22f
            setTextColor(INK)
            typeface = Typeface.DEFAULT_BOLD
            gravity = Gravity.CENTER
        }
        content.addView(title, LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT,
            ViewGroup.LayoutParams.WRAP_CONTENT,
        ))

        val message = TextView(this).apply {
            text = if (showLoading) "Loading your workspace…" else "Check your internet connection and try again."
            textSize = 15f
            setTextColor(SUBTLE)
            gravity = Gravity.CENTER
        }
        content.addView(message, LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT,
            ViewGroup.LayoutParams.WRAP_CONTENT,
        ).apply { topMargin = dp(8) })

        if (showLoading) {
            val spinner = ProgressBar(this).apply {
                indeterminateTintList = ColorStateList.valueOf(MINT)
            }
            content.addView(spinner, LinearLayout.LayoutParams(dp(38), dp(38)).apply {
                topMargin = dp(24)
            })
        } else {
            val retry = Button(this).apply {
                text = "Retry"
                isAllCaps = false
                backgroundTintList = ColorStateList.valueOf(MINT)
                setTextColor(INK)
                setOnClickListener { retryLoading() }
            }
            content.addView(retry, LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT,
                ViewGroup.LayoutParams.WRAP_CONTENT,
            ).apply { topMargin = dp(22) })
        }

        panel.addView(content, FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.WRAP_CONTENT,
            Gravity.CENTER,
        ))
        return panel
    }

    private fun createWebViewClient(): WebViewClient = object : WebViewClient() {
        override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
            if (!request.isForMainFrame) return false
            return routeUrl(request.url)
        }

        @Suppress("DEPRECATION")
        override fun shouldOverrideUrlLoading(view: WebView, url: String): Boolean = routeUrl(Uri.parse(url))

        override fun onPageStarted(view: WebView, url: String, favicon: android.graphics.Bitmap?) {
            super.onPageStarted(view, url, favicon)
            mainFrameFailed = false
            progressBar.visibility = View.VISIBLE
            if (!hasLoadedPage) loadingPanel.visibility = View.VISIBLE
        }

        override fun onPageFinished(view: WebView, url: String) {
            super.onPageFinished(view, url)
            if (mainFrameFailed) return
            hasLoadedPage = true
            lastSuccessfulUrl = url
            loadingPanel.visibility = View.GONE
            errorPanel.visibility = View.GONE
            progressBar.visibility = View.GONE
            view.visibility = View.VISIBLE
            CookieManager.getInstance().flush()
        }

        override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
            super.onReceivedError(view, request, error)
            if (request.isForMainFrame) showConnectionError()
        }

        override fun onReceivedHttpError(
            view: WebView,
            request: WebResourceRequest,
            errorResponse: WebResourceResponse,
        ) {
            super.onReceivedHttpError(view, request, errorResponse)
            if (request.isForMainFrame && errorResponse.statusCode >= 500) showConnectionError()
        }

        override fun onReceivedSslError(view: WebView, handler: SslErrorHandler, error: SslError) {
            handler.cancel()
            showConnectionError()
        }
    }

    private fun createWebChromeClient(): WebChromeClient = object : WebChromeClient() {
        override fun onProgressChanged(view: WebView, newProgress: Int) {
            progressBar.progress = newProgress
            progressBar.visibility = if (newProgress in 1..99) View.VISIBLE else View.GONE
        }

        override fun onShowFileChooser(
            view: WebView,
            filePathCallback: ValueCallback<Array<Uri>>,
            fileChooserParams: FileChooserParams,
        ): Boolean {
            this@MainActivity.fileChooserCallback?.onReceiveValue(null)
            this@MainActivity.fileChooserCallback = filePathCallback
            return try {
                startActivityForResult(fileChooserParams.createIntent(), FILE_PICKER_REQUEST)
                true
            } catch (_: Exception) {
                this@MainActivity.fileChooserCallback?.onReceiveValue(null)
                this@MainActivity.fileChooserCallback = null
                Toast.makeText(this@MainActivity, "Unable to open the file picker.", Toast.LENGTH_SHORT).show()
                false
            }
        }
    }

    private fun routeUrl(uri: Uri): Boolean {
        val scheme = uri.scheme?.lowercase(Locale.ROOT) ?: return true
        if (scheme == "http" || scheme == "https") {
            val host = uri.host?.lowercase(Locale.ROOT) ?: return true
            if (host == HOURLY_HOST || isAuthenticationHost(host)) return false
            openExternal(Intent(Intent.ACTION_VIEW, uri))
            return true
        }
        if (scheme == "javascript" || scheme == "file" || scheme == "content" || scheme == "data") return true

        if (scheme == "intent") {
            return try {
                val intent = Intent.parseUri(uri.toString(), Intent.URI_INTENT_SCHEME).apply {
                    addCategory(Intent.CATEGORY_BROWSABLE)
                    component = null
                    selector = null
                }
                startActivity(intent)
                true
            } catch (_: Exception) {
                Toast.makeText(this, "This link can't be opened.", Toast.LENGTH_SHORT).show()
                true
            }
        }

        openExternal(Intent(Intent.ACTION_VIEW, uri))
        return true
    }

    private fun isAuthenticationHost(host: String): Boolean =
        host == "accounts.google.com" ||
            host == "appleid.apple.com" ||
            host == "supabase.com" ||
            host.endsWith(".supabase.co")

    private fun openExternal(intent: Intent) {
        try {
            startActivity(intent)
        } catch (_: Exception) {
            Toast.makeText(this, "No app is available to open this link.", Toast.LENGTH_SHORT).show()
        }
    }

    private fun showConnectionError() {
        runOnUiThread {
            mainFrameFailed = true
            progressBar.visibility = View.GONE
            loadingPanel.visibility = View.GONE
            webView.visibility = View.GONE
            errorPanel.visibility = View.VISIBLE
        }
    }

    private fun retryLoading() {
        errorPanel.visibility = View.GONE
        webView.visibility = View.VISIBLE
        if (!hasLoadedPage) loadingPanel.visibility = View.VISIBLE
        webView.loadUrl(lastSuccessfulUrl ?: START_URL)
    }

    private fun registerDownloadReceiver() {
        val filter = IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE)
        if (Build.VERSION.SDK_INT >= 33) {
            registerReceiver(downloadReceiver, filter, Context.RECEIVER_EXPORTED)
        } else {
            @Suppress("DEPRECATION")
            registerReceiver(downloadReceiver, filter)
        }
        receiverRegistered = true
    }

    private fun startOrRequestDownload(
        url: String,
        userAgent: String?,
        contentDisposition: String?,
        mimeType: String?,
    ) {
        val uri = Uri.parse(url)
        if (uri.scheme != "https" && uri.scheme != "http") {
            Toast.makeText(this, "This download link isn't supported.", Toast.LENGTH_SHORT).show()
            return
        }
        val guessedName = URLUtil.guessFileName(url, contentDisposition, mimeType)
        val fileName = guessedName.substringAfterLast('/').substringAfterLast('\\').ifBlank { "hourly-download" }
        val download = PendingDownload(url, userAgent, mimeType, fileName)

        if (Build.VERSION.SDK_INT <= 28 &&
            checkSelfPermission(Manifest.permission.WRITE_EXTERNAL_STORAGE) != PackageManager.PERMISSION_GRANTED
        ) {
            pendingDownload = download
            requestPermissions(arrayOf(Manifest.permission.WRITE_EXTERNAL_STORAGE), STORAGE_PERMISSION_REQUEST)
            return
        }
        enqueueDownload(download)
    }

    private fun enqueueDownload(download: PendingDownload) {
        try {
            val request = DownloadManager.Request(Uri.parse(download.url)).apply {
                setTitle(download.fileName)
                setDescription("Downloading from Hourly")
                setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
                setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, download.fileName)
                download.userAgent?.let { addRequestHeader("User-Agent", it) }
                CookieManager.getInstance().getCookie(download.url)?.let { addRequestHeader("Cookie", it) }
                download.mimeType?.let { setMimeType(it) }
            }
            val id = (getSystemService(DOWNLOAD_SERVICE) as DownloadManager).enqueue(request)
            downloadNames[id] = download.fileName
            Toast.makeText(this, "Download started.", Toast.LENGTH_SHORT).show()
        } catch (_: Exception) {
            Toast.makeText(this, "Download failed to start. Please retry.", Toast.LENGTH_LONG).show()
        }
    }

    @Deprecated("Legacy callback required for WebView file chooser and Android 9 storage permission")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode != FILE_PICKER_REQUEST) return
        val callback = fileChooserCallback ?: return
        fileChooserCallback = null
        callback.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultCode, data))
    }

    @Deprecated("Legacy callback required for Android 9 storage permission")
    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode != STORAGE_PERMISSION_REQUEST) return
        val download = pendingDownload
        pendingDownload = null
        if (grantResults.firstOrNull() == PackageManager.PERMISSION_GRANTED && download != null) {
            enqueueDownload(download)
        } else {
            Toast.makeText(this, "Storage permission is needed to save this download.", Toast.LENGTH_LONG).show()
        }
    }

    override fun onBackPressed() {
        if (::webView.isInitialized && webView.canGoBack()) {
            webView.goBack()
        } else {
            super.onBackPressed()
        }
    }

    override fun onPause() {
        if (::webView.isInitialized) {
            webView.onPause()
            CookieManager.getInstance().flush()
        }
        super.onPause()
    }

    override fun onResume() {
        super.onResume()
        if (::webView.isInitialized) webView.onResume()
    }

    override fun onSaveInstanceState(outState: Bundle) {
        if (::webView.isInitialized) webView.saveState(outState)
        super.onSaveInstanceState(outState)
    }

    override fun onDestroy() {
        if (receiverRegistered) unregisterReceiver(downloadReceiver)
        fileChooserCallback?.onReceiveValue(null)
        fileChooserCallback = null
        if (::webView.isInitialized) {
            (webView.parent as? ViewGroup)?.removeView(webView)
            webView.stopLoading()
            webView.destroy()
        }
        super.onDestroy()
    }

    private fun dp(value: Int): Int = (value * resources.displayMetrics.density).toInt()

    companion object {
        private const val START_URL = "https://hourly-psi.vercel.app/dashboard"
        private const val HOURLY_HOST = "hourly-psi.vercel.app"
        private const val FILE_PICKER_REQUEST = 4101
        private const val STORAGE_PERMISSION_REQUEST = 4102
        private val MINT = Color.rgb(52, 211, 153)
        private val INK = Color.rgb(7, 17, 13)
        private val SUBTLE = Color.rgb(90, 103, 96)
        private val BACKGROUND = Color.rgb(246, 248, 247)
    }
}
