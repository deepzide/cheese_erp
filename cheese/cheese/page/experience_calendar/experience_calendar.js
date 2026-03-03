frappe.pages["experience-calendar"].on_page_load = function (wrapper) {
	frappe.experience_calendar = new ExperienceCalendar(wrapper);
};

class ExperienceCalendar {
	constructor(wrapper) {
		this.wrapper = wrapper;
		this.page = frappe.ui.make_app_page({
			parent: wrapper,
			title: __("Experience Calendar"),
			single_column: true,
			card_layout: false,
		});

		// Default to current week (Monday to Sunday)
		this.today = frappe.datetime.get_today();
		let today_obj = frappe.datetime.str_to_obj(this.today);
		let day_of_week = today_obj.getDay();
		// getDay() returns 0=Sunday, we want Monday as start
		let diff = day_of_week === 0 ? 6 : day_of_week - 1;
		this.start_date = frappe.datetime.add_days(this.today, -diff);
		this.num_days = 14; // show 2 weeks by default

		this.setup_controls();
		this.render_container();
		this.fetch_and_render();
	}

	setup_controls() {
		// Previous button
		this.page.add_button(__('<'), () => {
			this.start_date = frappe.datetime.add_days(this.start_date, -7);
			this.fetch_and_render();
		}, { btn_class: 'btn-default btn-sm' });

		// Next button
		this.page.add_button(__('>'), () => {
			this.start_date = frappe.datetime.add_days(this.start_date, 7);
			this.fetch_and_render();
		}, { btn_class: 'btn-default btn-sm' });

		// Today button
		this.page.add_button(__('Today'), () => {
			let today_obj = frappe.datetime.str_to_obj(frappe.datetime.get_today());
			let day_of_week = today_obj.getDay();
			let diff = day_of_week === 0 ? 6 : day_of_week - 1;
			this.start_date = frappe.datetime.add_days(frappe.datetime.get_today(), -diff);
			this.fetch_and_render();
		}, { btn_class: 'btn-primary btn-sm' });

		// View toggle: 1 week / 2 weeks / month
		this.page.add_field({
			fieldname: 'view_range',
			label: __('View'),
			fieldtype: 'Select',
			options: [
				{ label: __('1 Week'), value: '7' },
				{ label: __('2 Weeks'), value: '14' },
				{ label: __('1 Month'), value: '30' },
			],
			default: '14',
			change: () => {
				this.num_days = parseInt(this.page.fields_dict.view_range.get_value());
				this.fetch_and_render();
			}
		});
	}

	render_container() {
		this.$container = $('<div class="experience-calendar-container"></div>');
		$(this.page.body).append(this.$container);
	}

	fetch_and_render() {
		let end_date = frappe.datetime.add_days(this.start_date, this.num_days - 1);

		this.$container.html(`
			<div class="calendar-loading text-center text-muted py-5">
				<i class="fa fa-spinner fa-spin fa-2x"></i>
				<p class="mt-2">${__("Loading calendar...")}</p>
			</div>
		`);

		frappe.call({
			method: "cheese.cheese.page.experience_calendar.experience_calendar.get_calendar_data",
			args: {
				date_from: this.start_date,
				date_to: end_date,
			},
			callback: (r) => {
				if (r.message) {
					this.data = r.message;
					this.render_calendar();
				}
			}
		});
	}

	get_dates_array() {
		let dates = [];
		for (let i = 0; i < this.num_days; i++) {
			dates.push(frappe.datetime.add_days(this.start_date, i));
		}
		return dates;
	}

	render_calendar() {
		let dates = this.get_dates_array();
		let experiences = this.data.experiences || [];
		let slots = this.data.slots || [];

		// Build a lookup: { experience_name: [ slot, slot, ... ] }
		let slot_map = {};
		slots.forEach(slot => {
			if (!slot_map[slot.experience]) {
				slot_map[slot.experience] = [];
			}
			slot_map[slot.experience].push(slot);
		});

		// Calculate month headers
		let month_spans = this.get_month_spans(dates);

		let html = `<div class="calendar-wrapper">`;
		html += `<table class="calendar-grid">`;

		// Month header row
		html += `<thead>`;
		html += `<tr class="month-header-row">`;
		html += `<th class="experience-col sticky-col"></th>`;
		month_spans.forEach(ms => {
			html += `<th colspan="${ms.span}" class="month-header">${ms.label}</th>`;
		});
		html += `</tr>`;

		// Day header row
		html += `<tr class="day-header-row">`;
		html += `<th class="experience-col sticky-col">${__("Experiences")} (${experiences.length})</th>`;
		dates.forEach(date => {
			let d = frappe.datetime.str_to_obj(date);
			let day_name = d.toLocaleDateString('en', { weekday: 'short' }).toUpperCase().slice(0, 2);
			let day_num = d.getDate();
			let is_today = date === this.today;
			let is_weekend = d.getDay() === 0 || d.getDay() === 6;
			let cls = 'day-header';
			if (is_today) cls += ' today';
			if (is_weekend) cls += ' weekend';

			html += `<th class="${cls}">
				<div class="day-name">${day_name}</div>
				<div class="day-num">${day_num}</div>
			</th>`;
		});
		html += `</tr>`;
		html += `</thead>`;

		// Body rows - one per experience
		html += `<tbody>`;
		if (experiences.length === 0) {
			html += `<tr><td colspan="${dates.length + 1}" class="text-center text-muted py-4">
				${__("No experiences found. Create a Cheese Experience first.")}
			</td></tr>`;
		}

		experiences.forEach(exp => {
			let exp_slots = slot_map[exp.name] || [];
			html += this.render_experience_row(exp, exp_slots, dates);
		});

		html += `</tbody>`;
		html += `</table>`;
		html += `</div>`;

		this.$container.html(html);
		this.bind_events();
	}

	render_experience_row(experience, slots, dates) {
		let html = `<tr class="experience-row" data-experience="${experience.name}">`;

		// Experience name cell
		html += `<td class="experience-col sticky-col">
			<a href="/app/cheese-experience/${encodeURIComponent(experience.name)}" class="experience-name" title="${experience.name}">
				${frappe.utils.escape_html(experience.name)}
			</a>
		</td>`;

		// Date cells
		dates.forEach(date => {
			let is_today = date === this.today;
			let d = frappe.datetime.str_to_obj(date);
			let is_weekend = d.getDay() === 0 || d.getDay() === 6;
			let cell_cls = 'date-cell';
			if (is_today) cell_cls += ' today';
			if (is_weekend) cell_cls += ' weekend';

			// Find slots that cover this date
			let day_slots = slots.filter(s => {
				return s.date_from <= date && s.date_to >= date;
			});

			html += `<td class="${cell_cls}">`;

			if (day_slots.length > 0) {
				day_slots.forEach(slot => {
					let status_cls = 'slot-bar';
					if (slot.slot_status === 'OPEN') status_cls += ' slot-open';
					else if (slot.slot_status === 'CLOSED') status_cls += ' slot-closed';
					else if (slot.slot_status === 'BLOCKED') status_cls += ' slot-blocked';

					let available = slot.max_capacity - (slot.reserved_capacity || 0);
					let time_label = '';
					if (slot.time_from) {
						time_label = slot.time_from.substring(0, 5);
						if (slot.time_to) {
							time_label += '-' + slot.time_to.substring(0, 5);
						}
					}

					let capacity_label = `${slot.reserved_capacity || 0}/${slot.max_capacity}`;

					// Check if this is the first day of the slot in the visible range
					let slot_start_in_view = slot.date_from < this.start_date ? this.start_date : slot.date_from;
					let is_slot_start = (date === slot_start_in_view);

					// Calculate how many days this slot spans in view
					let end_date = frappe.datetime.add_days(this.start_date, this.num_days - 1);
					let slot_end_in_view = slot.date_to > end_date ? end_date : slot.date_to;

					let tooltip = `${experience.name}\n${__("Status")}: ${slot.slot_status}\n${__("Capacity")}: ${capacity_label}\n${__("Date")}: ${slot.date_from} - ${slot.date_to}`;
					if (time_label) tooltip += `\n${__("Time")}: ${time_label}`;

					html += `<div class="${status_cls}" 
						data-slot="${slot.name}" 
						title="${frappe.utils.escape_html(tooltip)}"
						onclick="frappe.set_route('Form', 'Cheese Experience Slot', '${slot.name}')">`;

					// Show capacity info in cell
					html += `<span class="slot-capacity">${capacity_label}</span>`;
					if (time_label) {
						html += `<span class="slot-time">${time_label}</span>`;
					}

					html += `</div>`;
				});
			}

			html += `</td>`;
		});

		html += `</tr>`;
		return html;
	}

	get_month_spans(dates) {
		let spans = [];
		let current_month = null;
		let current_span = 0;

		dates.forEach((date, idx) => {
			let d = frappe.datetime.str_to_obj(date);
			let month_key = d.getFullYear() + '-' + (d.getMonth() + 1);
			let month_label = d.toLocaleDateString('en', { month: 'long', year: 'numeric' });

			if (month_key !== current_month) {
				if (current_month !== null) {
					spans.push({ label: spans.length > 0 ? spans[spans.length - 1]._next_label : '', span: current_span });
				}
				current_month = month_key;
				current_span = 1;
				if (spans.length === 0) {
					spans.push({ label: month_label, span: 0, _next_label: month_label });
				} else {
					spans[spans.length - 1]._next_label = month_label;
				}
			} else {
				current_span++;
			}
		});

		// Rebuild spans properly
		spans = [];
		current_month = null;
		current_span = 0;
		let current_label = '';

		dates.forEach((date) => {
			let d = frappe.datetime.str_to_obj(date);
			let month_key = d.getFullYear() + '-' + (d.getMonth() + 1);
			let month_label = d.toLocaleDateString('en', { month: 'long', year: 'numeric' });

			if (month_key !== current_month) {
				if (current_month !== null) {
					spans.push({ label: current_label, span: current_span });
				}
				current_month = month_key;
				current_label = month_label;
				current_span = 1;
			} else {
				current_span++;
			}
		});

		if (current_span > 0) {
			spans.push({ label: current_label, span: current_span });
		}

		return spans;
	}

	bind_events() {
		// Slot bar click is handled inline via onclick
		// Add hover effects via CSS
	}
}
