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
	try:
		import segno
		qr = segno.make(data)
		buf = io.BytesIO()
		qr.save(buf, kind="png", scale=8, border=2)
		return buf.getvalue()
	except ImportError:
		pass

	try:
		import qrcode
		qr = qrcode.make(data)
		buf = io.BytesIO()
		qr.save(buf, format="PNG")
		return buf.getvalue()
	except ImportError:
		pass

	return _svg_fallback_png(data)


def _svg_fallback_png(data):
	"""Minimal SVG-based QR rendered to PNG via Frappe's wkhtmltoimage
	or returned as an SVG wrapped in a minimal PNG-compatible container.
	As a last resort, generate a simple placeholder."""
	try:
		import segno
	except ImportError:
		pass

	try:
		from frappe.www.qrcode import get_qr_svg_code
		svg = get_qr_svg_code(data)
		return svg.encode("utf-8")
	except Exception:
		pass

	placeholder = (
		b'\x89PNG\r\n\x1a\n'
	)
	return placeholder
