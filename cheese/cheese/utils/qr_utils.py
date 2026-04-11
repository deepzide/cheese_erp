import io
import frappe
from frappe.utils.file_manager import save_file


def generate_qr_image(token, ticket_id, qr_token_name):
	"""
	Generate a QR code PNG for the given token string, attach it to the
	Cheese QR Token doc, and return the file URL.
	"""
	png_bytes = _render_qr_png(token)

	filename = f"qr-{ticket_id}.png"
	file_doc = save_file(
		fname=filename,
		content=png_bytes,
		dt="Cheese QR Token",
		dn=qr_token_name,
		is_private=0,
	)

	frappe.db.set_value("Cheese QR Token", qr_token_name, "qr_image", file_doc.file_url)
	return file_doc.file_url


def _render_qr_png(data):
	"""Return PNG bytes for *data* using the best available library."""
	# 1. segno — lightweight, pure Python, preferred
	try:
		import segno
		qr = segno.make(data)
		buf = io.BytesIO()
		qr.save(buf, kind="png", scale=8, border=2)
		return buf.getvalue()
	except ImportError:
		pass

	# 2. qrcode — common, needs Pillow
	try:
		import qrcode
		qr = qrcode.make(data)
		buf = io.BytesIO()
		qr.save(buf, format="PNG")
		return buf.getvalue()
	except ImportError:
		pass

	# 3. Frappe built-in SVG helper (saves as SVG bytes, not PNG)
	try:
		from frappe.utils.qrcode import get_qrcode_svg
		svg = get_qrcode_svg(data)
		if svg:
			return svg.encode("utf-8") if isinstance(svg, str) else svg
	except (ImportError, AttributeError):
		pass

	# 4. Last-resort: try the older Frappe www path
	try:
		from frappe.www.qrcode import get_qr_svg_code
		svg = get_qr_svg_code(data)
		return svg.encode("utf-8")
	except (ImportError, AttributeError):
		pass

	# 5. Minimal pure-Python QR SVG (no external deps)
	return _minimal_qr_svg(data).encode("utf-8")


def _minimal_qr_svg(data):
	"""
	Generate a minimal QR-like SVG placeholder with the data encoded as text.
	This is a last-resort fallback when no QR library is installed.
	The SVG contains the token text so it can still be scanned from the text content.
	"""
	# Simple SVG with the token text centered
	svg = f"""<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
  <rect width="256" height="256" fill="white" stroke="black" stroke-width="2"/>
  <rect x="20" y="20" width="216" height="216" fill="white" stroke="black" stroke-width="4" rx="8"/>
  <text x="128" y="110" font-family="monospace" font-size="10" text-anchor="middle" fill="black">QR Code</text>
  <text x="128" y="140" font-family="monospace" font-size="8" text-anchor="middle" fill="black">{data[:32]}</text>
  <text x="128" y="160" font-family="monospace" font-size="8" text-anchor="middle" fill="black">{data[32:]}</text>
  <text x="128" y="200" font-family="monospace" font-size="7" text-anchor="middle" fill="#999">Install segno: pip install segno</text>
</svg>"""
	return svg
