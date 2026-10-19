import { proxySocialImage } from "@/lib/social-proxy";

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  return proxySocialImage(`listings/${params.id}/social/story`);
}
