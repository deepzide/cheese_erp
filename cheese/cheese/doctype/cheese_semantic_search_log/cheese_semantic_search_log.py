# Copyright (c) 2024
# License: MIT

from frappe.model.document import Document


class CheeseSemanticSearchLog(Document):
	# begin: auto-generated types
	# This code is auto-generated. Do not modify anything in this block.

	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from frappe.types import DF

		entity_id: DF.Data | None
		entity_type: DF.Data | None
		min_similarity: DF.Float
		query: DF.Data
		results_count: DF.Int
		results_json: DF.LongText | None
		source: DF.Literal["API", "TEST"]
		top_k: DF.Int
	# end: auto-generated types

	pass
