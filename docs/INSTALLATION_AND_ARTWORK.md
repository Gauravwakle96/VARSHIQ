# Installation enquiries and decorative artwork

The Improvements page includes an external supplier listing and a request builder.
Users can contact a supplier, open a WhatsApp draft or browse the supplier's parts
store. VARSHIQ does not operate checkout, take payments, confirm stock, book work,
assign an installer or certify installation suitability. No partnership is claimed.

Initial listing checked on 2026-11-02:

| Public destination | Evidence |
| --- | --- |
| [Rainy Filters / Farmland Rain Water Harvesting Systems](https://www.rainyfilters.com/) | Official homepage describes rooftop filters and design-to-execution harvesting services; links its store and public WhatsApp contact |
| [Installation enquiry](https://www.rainyfilters.com/contact-us/enquire) | HTTP 200; official contact page |
| [Systems and solutions](https://www.rainyfilters.com/products/systems-and-solutions) | HTTP 200; official service description |
| [Parts store](https://shop.rainyfilters.com/) | HTTP 200; linked from the official homepage |

The WhatsApp destination is the public `wa.me` link published on that homepage.
Availability in a Maharashtra locality, installation scope, itemised costs, warranty
and maintenance are questions for the supplier. Vendor marketing claims and area
methods are not incorporated into VARSHIQ's engineering model. Supplier images,
logos, prices, reviews and product descriptions have not been copied.

The request builder starts without private property data. City/locality and service
type are entered locally by the user. The generated text is visible before opening
WhatsApp; opening the link does not send the message. The contact form and store use
static external URLs and `rel="noopener noreferrer"`. No inquiry, order or personal
contact record is sent to the VARSHIQ backend by this component.

`frontend/public/images/roof-to-tank.svg` and `rainfall-background.svg` are original,
project-created decorative illustrations. They depict a conceptual roof, collection
pipe, filter, tank and rain. They are not site photographs, a construction design,
measurements or a representation of an existing customer's installation. They are
served locally as CSS backgrounds, carry no user data and need no external API.
