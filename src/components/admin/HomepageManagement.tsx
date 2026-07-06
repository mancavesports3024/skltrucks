"use client";

import Image from "next/image";
import { useState } from "react";
import { updateSiteContent, uploadSiteImage } from "@/app/admin/actions";
import type { SiteContent } from "@/types/site-content";

const inputClass =
  "w-full border border-neutral-300 px-4 py-2.5 text-sm focus:border-[#fc0527] focus:outline-none focus:ring-1 focus:ring-[#fc0527]";
const labelClass = "mb-1 block text-sm font-semibold";
const sectionClass = "bg-white p-6 shadow";

interface HomepageManagementProps {
  initialContent: SiteContent;
  dbReady: boolean;
}

function ImageField({
  label,
  name,
  value,
  onChange,
}: {
  label: string;
  name: string;
  value: string;
  onChange: (url: string) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState("");

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setUploadMessage("Uploading...");

    const formData = new FormData();
    formData.set("file", file);
    const result = await uploadSiteImage(formData);

    if (result.url) {
      onChange(result.url);
      setUploadMessage("Image uploaded.");
    } else {
      setUploadMessage(result.error || "Upload failed.");
    }

    setUploading(false);
    e.target.value = "";
  }

  return (
    <div>
      <label className={labelClass}>{label}</label>
      <input
        type="url"
        name={name}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="https://..."
        className={inputClass}
      />
      <div className="mt-3">
        <label className="inline-block cursor-pointer bg-neutral-100 px-4 py-2 text-sm font-medium hover:bg-neutral-200">
          {uploading ? "Uploading..." : "Upload image"}
          <input
            type="file"
            accept="image/jpeg,image/jpg,image/png,image/gif,image/webp"
            className="hidden"
            disabled={uploading}
            onChange={handleUpload}
          />
        </label>
        {uploadMessage && <p className="mt-2 text-xs text-neutral-500">{uploadMessage}</p>}
      </div>
      {value && (
        <div className="relative mt-3 h-32 w-full max-w-sm overflow-hidden border border-neutral-200">
          <Image src={value} alt="" fill className="object-cover" sizes="320px" />
        </div>
      )}
    </div>
  );
}

export default function HomepageManagement({ initialContent, dbReady }: HomepageManagementProps) {
  const [content, setContent] = useState(initialContent);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [saving, setSaving] = useState(false);

  function updateHero<K extends keyof SiteContent["hero"]>(key: K, value: SiteContent["hero"][K]) {
    setContent((prev) => ({ ...prev, hero: { ...prev.hero, [key]: value } }));
  }

  function updateAbout<K extends keyof SiteContent["about"]>(key: K, value: SiteContent["about"][K]) {
    setContent((prev) => ({ ...prev, about: { ...prev.about, [key]: value } }));
  }

  function updateCta<K extends keyof SiteContent["cta"]>(key: K, value: SiteContent["cta"][K]) {
    setContent((prev) => ({ ...prev, cta: { ...prev.cta, [key]: value } }));
  }

  function updateWhyChoose<K extends keyof SiteContent["whyChoose"]>(
    key: K,
    value: SiteContent["whyChoose"][K]
  ) {
    setContent((prev) => ({ ...prev, whyChoose: { ...prev.whyChoose, [key]: value } }));
  }

  function updateContact<K extends keyof SiteContent["contact"]>(
    key: K,
    value: SiteContent["contact"][K]
  ) {
    setContent((prev) => ({ ...prev, contact: { ...prev.contact, [key]: value } }));
  }

  function updateSocial<K extends keyof SiteContent["social"]>(
    key: K,
    value: SiteContent["social"][K]
  ) {
    setContent((prev) => ({ ...prev, social: { ...prev.social, [key]: value } }));
  }

  function updateService(
    index: number,
    key: keyof SiteContent["services"][number],
    value: string
  ) {
    setContent((prev) => ({
      ...prev,
      services: prev.services.map((service, i) =>
        i === index ? { ...service, [key]: value } : service
      ),
    }));
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!dbReady) return;

    setSaving(true);
    setError("");
    setSuccess(false);

    const formData = new FormData(e.currentTarget);
    const result = await updateSiteContent(formData);

    if (result?.error) {
      setError(result.error);
    } else {
      setSuccess(true);
    }

    setSaving(false);
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      {!dbReady && (
        <div className="mb-6 border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800">
          <strong>Database not connected.</strong> Add Supabase environment variables and run the
          updated <code className="bg-amber-100 px-1">supabase/schema.sql</code> in the SQL Editor
          before saving homepage content.
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-8">
        <section className={sectionClass}>
          <h2 className="mb-4 text-lg font-bold">Hero Section</h2>
          <div className="space-y-4">
            <div>
              <label className={labelClass}>Headline (one line per row)</label>
              <textarea
                name="hero_headline"
                rows={3}
                value={content.hero.headline}
                onChange={(e) => updateHero("headline", e.target.value)}
                className={inputClass}
              />
            </div>
            <ImageField
              label="Hero background image"
              name="hero_image"
              value={content.hero.image}
              onChange={(url) => updateHero("image", url)}
            />
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className={labelClass}>Button text</label>
                <input
                  name="hero_buttonText"
                  value={content.hero.buttonText}
                  onChange={(e) => updateHero("buttonText", e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Button link</label>
                <input
                  name="hero_buttonLink"
                  value={content.hero.buttonLink}
                  onChange={(e) => updateHero("buttonLink", e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>
          </div>
        </section>

        <section className={sectionClass}>
          <h2 className="mb-4 text-lg font-bold">About Us</h2>
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className={labelClass}>Subtitle</label>
                <input
                  name="about_subtitle"
                  value={content.about.subtitle}
                  onChange={(e) => updateAbout("subtitle", e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Title</label>
                <input
                  name="about_title"
                  value={content.about.title}
                  onChange={(e) => updateAbout("title", e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>
            <div>
              <label className={labelClass}>Body text</label>
              <textarea
                name="about_body"
                rows={5}
                value={content.about.body}
                onChange={(e) => updateAbout("body", e.target.value)}
                className={inputClass}
              />
            </div>
            <ImageField
              label="About image"
              name="about_image"
              value={content.about.image}
              onChange={(url) => updateAbout("image", url)}
            />
          </div>
        </section>

        <section className={sectionClass}>
          <h2 className="mb-4 text-lg font-bold">CTA Banner</h2>
          <div className="space-y-4">
            <div>
              <label className={labelClass}>Headline (one line per row)</label>
              <textarea
                name="cta_headline"
                rows={2}
                value={content.cta.headline}
                onChange={(e) => updateCta("headline", e.target.value)}
                className={inputClass}
              />
            </div>
            <ImageField
              label="CTA background image"
              name="cta_image"
              value={content.cta.image}
              onChange={(url) => updateCta("image", url)}
            />
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className={labelClass}>Button text</label>
                <input
                  name="cta_buttonText"
                  value={content.cta.buttonText}
                  onChange={(e) => updateCta("buttonText", e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Button link</label>
                <input
                  name="cta_buttonLink"
                  value={content.cta.buttonLink}
                  onChange={(e) => updateCta("buttonLink", e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>
          </div>
        </section>

        <section className={sectionClass}>
          <h2 className="mb-4 text-lg font-bold">Services (3 cards)</h2>
          <div className="space-y-6">
            {content.services.map((service, index) => (
              <div key={index} className="border border-neutral-200 p-4">
                <h3 className="mb-3 text-sm font-bold uppercase text-neutral-500">
                  Service {index + 1}
                </h3>
                <div className="space-y-3">
                  <div>
                    <label className={labelClass}>Title</label>
                    <input
                      name={`service_${index}_title`}
                      value={service.title}
                      onChange={(e) => updateService(index, "title", e.target.value)}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Description</label>
                    <textarea
                      name={`service_${index}_description`}
                      rows={3}
                      value={service.description}
                      onChange={(e) => updateService(index, "description", e.target.value)}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Link</label>
                    <input
                      name={`service_${index}_href`}
                      value={service.href}
                      onChange={(e) => updateService(index, "href", e.target.value)}
                      className={inputClass}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className={sectionClass}>
          <h2 className="mb-4 text-lg font-bold">Why Choose Us</h2>
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className={labelClass}>Subtitle</label>
                <input
                  name="whyChoose_subtitle"
                  value={content.whyChoose.subtitle}
                  onChange={(e) => updateWhyChoose("subtitle", e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Title</label>
                <input
                  name="whyChoose_title"
                  value={content.whyChoose.title}
                  onChange={(e) => updateWhyChoose("title", e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>
            <div>
              <label className={labelClass}>Body text</label>
              <textarea
                name="whyChoose_body"
                rows={5}
                value={content.whyChoose.body}
                onChange={(e) => updateWhyChoose("body", e.target.value)}
                className={inputClass}
              />
            </div>
            <ImageField
              label="Why Choose Us image"
              name="whyChoose_image"
              value={content.whyChoose.image}
              onChange={(url) => updateWhyChoose("image", url)}
            />
          </div>
        </section>

        <section className={sectionClass}>
          <h2 className="mb-4 text-lg font-bold">Contact Info</h2>
          <p className="mb-4 text-sm text-neutral-500">
            Updates the header, footer, and contact page.
          </p>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className={labelClass}>Phone</label>
              <input
                name="contact_phone"
                value={content.contact.phone}
                onChange={(e) => updateContact("phone", e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Email</label>
              <input
                name="contact_email"
                type="email"
                value={content.contact.email}
                onChange={(e) => updateContact("email", e.target.value)}
                className={inputClass}
              />
            </div>
            <div className="md:col-span-2">
              <label className={labelClass}>Address</label>
              <input
                name="contact_address"
                value={content.contact.address}
                onChange={(e) => updateContact("address", e.target.value)}
                className={inputClass}
              />
            </div>
          </div>
        </section>

        <section className={sectionClass}>
          <h2 className="mb-4 text-lg font-bold">Social Links</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className={labelClass}>Facebook URL</label>
              <input
                name="social_facebook"
                type="url"
                value={content.social.facebook}
                onChange={(e) => updateSocial("facebook", e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>LinkedIn URL</label>
              <input
                name="social_linkedin"
                type="url"
                value={content.social.linkedin}
                onChange={(e) => updateSocial("linkedin", e.target.value)}
                className={inputClass}
              />
            </div>
          </div>
        </section>

        {error && <p className="text-sm text-red-600">{error}</p>}
        {success && (
          <p className="text-sm text-green-700">Homepage content saved. Changes are live on the site.</p>
        )}

        <button
          type="submit"
          disabled={!dbReady || saving}
          className="bg-[#fc0527] px-8 py-3 text-sm font-semibold uppercase text-white hover:bg-[#d90422] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save Homepage Content"}
        </button>
      </form>
    </div>
  );
}
