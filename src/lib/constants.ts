export const SITE = {
  name: "SKL Trucks LLC",
  phone: "417-434-8669",
  phoneHref: "tel:4174348669",
  email: "skltrucksllc@gmail.com",
  address: "4000 W 7th St. Joplin, Mo. 64801",
  facebook: "https://www.facebook.com/profile.php?id=61557165207913",
  linkedin: "https://www.linkedin.com/company/skl-trucks-llc/",
  logo: "/logo.jpg",
  heroImage: "https://skltrucks.com/wp-content/uploads/2025/08/image-49.png",
  aboutImage: "https://skltrucks.com/wp-content/uploads/2024/06/SKL-Trucks-LLC.jpeg",
  whyChooseImage:
    "https://skltrucks.com/wp-content/uploads/2024/06/hddddddddss-removebg-preview.png",
  ctaImage: "https://skltrucks.com/wp-content/uploads/2024/05/6e0eb62c39ad8edfd56696e4ad2d702e.png",
  deliveryIcon: "https://skltrucks.com/wp-content/uploads/2024/06/delivery-1.png",
};

export const INVENTORY_CATEGORIES = [
  { label: "Sleeper Trucks", slug: "sleeper-trucks" },
  {
    label: "DELIVERY / MOVING / STRAIGHT / REFRIGERATED BOX TRUCKS",
    slug: "delivery-moving-straight-refrigerated-box-trucks",
  },
  { label: "Day Cabs", slug: "day-cabs" },
];

export const MANUFACTURERS = [
  { label: "Freightliner", slug: "freightliner" },
  { label: "International", slug: "international" },
  { label: "Kenworth", slug: "kenworth" },
  { label: "Volvo", slug: "volvo" },
  { label: "Peterbilt", slug: "peterbilt" },
];

export const NAV_LINKS = [
  { label: "Home", href: "/" },
  {
    label: "INVENTORY",
    href: "/shop",
    children: [
      { label: "Sleeper Trucks", href: "/shop?category=sleeper-trucks" },
      {
        label: "DELIVERY / MOVING / STRAIGHT / REFRIGERATED BOX TRUCKS",
        href: "/shop?category=delivery-moving-straight-refrigerated-box-trucks",
      },
      { label: "Day Cabs", href: "/shop?category=day-cabs" },
      { label: "Browse All", href: "/shop" },
    ],
  },
  {
    label: "MANUFACTURERS",
    href: "/shop",
    children: [
      { label: "Freightliner", href: "/shop?manufacturer=freightliner" },
      { label: "International", href: "/shop?manufacturer=international" },
      { label: "Kenworth", href: "/shop?manufacturer=kenworth" },
      { label: "Volvo", href: "/shop?manufacturer=volvo" },
      { label: "Peterbilt", href: "/shop?manufacturer=peterbilt" },
      { label: "Browse All", href: "/shop" },
    ],
  },
  { label: "Financing", href: "/financing" },
  {
    label: "SERVICES",
    href: "/services",
    children: [
      { label: "Truck Sales", href: "/truck-sales" },
      { label: "Truck Financing", href: "/truck-financing" },
      { label: "Sell My Truck", href: "/sell-my-truck" },
    ],
  },
  { label: "CONTACT US", href: "/contact-us" },
];
