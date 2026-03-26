import { ScrollViewStyleReset } from 'expo-router/html';

// This file is web-only and used to configure the root HTML for every
// web page during static rendering.
// The contents of this function only run in Node.js environments and
// do not have access to the DOM or browser APIs.
export default function Root({ children }: { children: React.ReactNode }) {
    return (
        <html lang="zh-Hant">
            <head>
                <meta charSet="utf-8" />
                <meta http-equiv="X-UA-Compatible" content="IE=edge" />
                <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />
                <ScrollViewStyleReset />
                <style dangerouslySetInnerHTML={{ __html: responsiveBackground }} />
            </head>
            <body>{children}</body>
        </html>
    );
}

const responsiveBackground = `
body {
  background-color: #F8FAFC;
}
@media (min-width: 400px) {
  /* Remove Expo Router's default 400px max-width wrapper styles if present */
  #root {
    width: 100vw !important;
    max-width: none !important;
    box-shadow: none !important; /* Remove shadow on web page */
  }
}
`;
