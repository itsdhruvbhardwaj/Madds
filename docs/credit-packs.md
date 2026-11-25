# Credit packs

Create and activate these consumable one-time products in Google Play Console:

| Credits | India price | Product ID | Buy purchase option ID |
|---|---|---|---|
| 40 | INR 20 | `madds_credits_40` | `buy-40-credits` |
| 110 | INR 50 | `madds_credits_110` | `buy-110-credits` |
| 250 | Existing product/price | `com.itsdhruvhardwaj.picme_credit_25` | `buy-250-credits` |

The existing product ID is preserved. Set prices, regions and active purchase
options in Play Console; the app displays Google's returned localized prices.
There are no hardcoded checkout prices. New packs cannot be purchased until Play
returns their active product details for the tester's country/account.

Android queries all three products, shows a pack selector, and uses the selected
product's price, offer token and purchase option. Recovery handles all three.
The backend determines credit quantities from verified product IDs, never from
client-supplied credit amounts. Test each pack through a Play license tester
before release. No Play Console products are created by the code deployment.
